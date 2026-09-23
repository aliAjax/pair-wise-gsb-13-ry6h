import type { Authorization, Conflict, FuelCard, Shift, StationState } from "../domain/types";
import { normalizePlate } from "../domain/plate";
import { round2 } from "../domain/money";
import { snapshotOf } from "./adjust";

const RULE = {
  CARD_MISSING: "授权引用了不存在的卡号",
  PLATE_MISMATCH: "开泵车牌与卡片绑定车牌不符",
  CARD_BUSY: "同卡存在多笔未结授权（开泵唯一性）",
  NOZZLE_BUSY: "同一油枪存在多笔未结授权（油枪互斥）",
  OVER_FROZEN: "未结冻结额度超过卡内余额",
  SETTLE_GAP: "结清金额与冻结+补收不一致",
  VERSION_SNAPSHOT: "版本链快照与授权当前数据不一致",
  VERSION_SHAPE: "版本链编号或动作不连续",
  SHIFT_MISSING: "授权归属班次不存在",
  SHIFT_OWNER_CLOSED: "未结授权滞留在已关班班次（未完成交接）",
  SHIFT_HANDOVER: "关班班次交接记录与未结授权不一致"
} as const;

function push(list: Conflict[], c: Conflict) {
  list.push(c);
}

/**
 * 重开后的一致性核对：卡片、授权、班次、版本四者必须一致。
 * 每条冲突都带卡号、油枪、差额（无金额含义时为 0）和所违反的规则。
 */
export function checkConsistency(state: StationState): Conflict[] {
  const conflicts: Conflict[] = [];
  const cardByNo = new Map(state.cards.map((c) => [c.cardNo, c]));
  const shiftById = new Map(state.shifts.map((s) => [s.id, s]));

  const openAuths = state.authorizations.filter((a) => a.status === "open");

  // R01 卡号存在性
  for (const a of state.authorizations) {
    if (!cardByNo.has(a.cardNo)) {
      push(conflicts, {
        cardNo: a.cardNo,
        nozzle: a.nozzle,
        difference: 0,
        rule: RULE.CARD_MISSING,
        detail: `授权 ${a.id} 的卡号在卡片资料中不存在`
      });
    }
  }

  // R02 车牌一致
  for (const a of state.authorizations) {
    const card = cardByNo.get(a.cardNo);
    if (card && normalizePlate(a.plate) !== normalizePlate(card.holderPlate)) {
      push(conflicts, {
        cardNo: a.cardNo,
        nozzle: a.nozzle,
        difference: 0,
        rule: RULE.PLATE_MISMATCH,
        detail: `授权登记车牌 ${a.plate} ≠ 卡片绑定车牌 ${card.holderPlate}`
      });
    }
  }

  // R03 同卡未结唯一
  for (const card of state.cards) {
    const dupes = openAuths.filter((a) => a.cardNo === card.cardNo);
    if (dupes.length > 1) {
      for (const a of dupes) {
        push(conflicts, {
          cardNo: card.cardNo,
          nozzle: a.nozzle,
          difference: 0,
          rule: RULE.CARD_BUSY,
          detail: `卡号共有 ${dupes.length} 笔未结授权，最多只能 1 笔`
        });
      }
    }
  }

  // R04 油枪互斥
  for (const a of openAuths) {
    const dupes = openAuths.filter((x) => x.nozzle === a.nozzle);
    if (dupes.length > 1) {
      push(conflicts, {
        cardNo: a.cardNo,
        nozzle: a.nozzle,
        difference: 0,
        rule: RULE.NOZZLE_BUSY,
        detail: `油枪 ${a.nozzle} 同时挂有 ${dupes.length} 笔未结授权`
      });
    }
  }

  // R05 未结冻结不得超过卡内余额
  for (const card of state.cards) {
    const mine = openAuths.filter((a) => a.cardNo === card.cardNo);
    const frozen = round2(mine.reduce((s, a) => s + a.frozenAmount, 0));
    if (frozen > card.balance) {
      for (const a of mine) {
        push(conflicts, {
          cardNo: card.cardNo,
          nozzle: a.nozzle,
          difference: round2(frozen - card.balance),
          rule: RULE.OVER_FROZEN,
          detail: `未结冻结 ¥${frozen.toFixed(2)} 超过卡内余额 ¥${card.balance.toFixed(2)}`
        });
      }
    }
  }

  // R06 结清差额：finalAmount 必须 ≤ frozen + extra，超出部分必须补收齐
  for (const a of state.authorizations.filter((x) => x.status === "settled")) {
    const over = round2(a.frozenAmount + a.extraCollected - (a.finalAmount ?? 0));
    if (over < -0.0001) {
      push(conflicts, {
        cardNo: a.cardNo,
        nozzle: a.nozzle,
        difference: round2(-over),
        rule: RULE.SETTLE_GAP,
        detail: `结清 ¥${(a.finalAmount ?? 0).toFixed(2)} 超出冻结+补收 ¥${(a.frozenAmount + a.extraCollected).toFixed(2)} 且未补收齐`
      });
    }
  }

  // R07 版本链快照
  for (const a of state.authorizations) {
    for (const v of a.versions) {
      const current = snapshotOf(a);
      const mismatch = (Object.keys(v.snapshot) as (keyof typeof current)[]).some(
        (k) => v.snapshot[k] !== current[k]
      );
      if (mismatch && v.version === a.versions.length) {
        push(conflicts, {
          cardNo: a.cardNo,
          nozzle: a.nozzle,
          difference: 0,
          rule: RULE.VERSION_SNAPSHOT,
          detail: `最新版本 v${v.version} 快照与授权当前数据不一致（有改动未另存版本）`
        });
      }
    }
  }

  // R08 版本编号/动作连续：v1 freeze、v2 settle、之后均为 adjust
  for (const a of state.authorizations) {
    const expectedActions = a.versions.map((_, i) =>
      i === 0 ? "freeze" : i === 1 ? "settle" : "adjust"
    );
    const bad = a.versions.some(
      (v, i) => v.version !== i + 1 || v.action !== expectedActions[i]
    );
    if (bad || (a.status === "settled" && a.versions.length < 2)) {
      push(conflicts, {
        cardNo: a.cardNo,
        nozzle: a.nozzle,
        difference: 0,
        rule: RULE.VERSION_SHAPE,
        detail: `版本链应从 v1 freeze、v2 settle 连续编号，实际 ${a.versions
          .map((v) => `v${v.version}:${v.action}`)
          .join(" → ") || "空"}`
      });
    }
  }

  // R09 班次存在性 & R10 未结授权不得滞留已关班班次
  for (const a of state.authorizations) {
    const owner = shiftById.get(a.ownerShiftId);
    if (!owner) {
      push(conflicts, {
        cardNo: a.cardNo,
        nozzle: a.nozzle,
        difference: 0,
        rule: RULE.SHIFT_MISSING,
        detail: `授权归属班次 ${a.ownerShiftId} 不存在`
      });
    } else if (a.status === "open" && owner.status === "closed") {
      push(conflicts, {
        cardNo: a.cardNo,
        nozzle: a.nozzle,
        difference: 0,
        rule: RULE.SHIFT_OWNER_CLOSED,
        detail: `未结授权仍挂在已关班班次「${owner.name}」，交接未完成`
      });
    }
  }

  // R11 关班班次交接记录与其未结授权必须一致
  for (const s of state.shifts.filter((x) => x.status === "closed")) {
    const handover = s.handover;
    const leftOpen = state.authorizations.filter(
      (a) => a.openedShiftId === s.id && a.status === "open"
    );
    if (leftOpen.length > 0 && !handover) {
      push(conflicts, {
        cardNo: leftOpen[0].cardNo,
        nozzle: leftOpen[0].nozzle,
        difference: leftOpen.length,
        rule: RULE.SHIFT_HANDOVER,
        detail: `班次「${s.name}」已关班且留有 ${leftOpen.length} 笔未结授权，但缺少交接记录`
      });
    }
    if (handover) {
      const target = shiftById.get(handover.toShiftId);
      if (!target) {
        push(conflicts, {
          cardNo: "",
          nozzle: "",
          difference: 0,
          rule: RULE.SHIFT_HANDOVER,
          detail: `班次「${s.name}」交接目标班次 ${handover.toShiftId} 不存在`
        });
      } else {
        const actually = state.authorizations.filter(
          (a) => a.status === "open" && a.ownerShiftId === target.id
        ).length;
        if (actually !== handover.authIds.length) {
          push(conflicts, {
            cardNo: "",
            nozzle: "",
            difference: actually - handover.authIds.length,
            rule: RULE.SHIFT_HANDOVER,
            detail: `交接记录 ${handover.authIds.length} 笔，接班班次实际未结 ${actually} 笔`
          });
        }
      }
    }
  }

  return conflicts;
}
