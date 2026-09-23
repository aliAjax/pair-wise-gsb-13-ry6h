// 判定层 · 重开一致性自检：冲突固定输出 卡号、油枪、差额、规则
import type { Conflict, Database } from "../domain/types";
import { round2 } from "../domain/money";

function push(list: Conflict[], c: Conflict) {
  if (!list.some((x) => x.key === c.key)) list.push(c);
}

/**
 * 校验四类资料的交叉一致性：
 * 卡片余额冻结差额 / 授权引用完整性 / 班次归属 / 版本快照
 */
export function detectConflicts(db: Database): Conflict[] {
  const conflicts: Conflict[] = [];

  // 1. 每张卡：余额 - 未结冻结额 不得为负
  for (const card of db.cards) {
    const frozen = round2(
      db.auths
        .filter((a) => a.cardNo === card.cardNo && a.status === "frozen")
        .reduce((sum, a) => sum + a.amount, 0)
    );
    const delta = round2(card.balance - frozen);
    if (delta < -Number.EPSILON) {
      push(conflicts, {
        key: `card-overfreeze-${card.cardNo}`,
        cardNo: card.cardNo,
        pumpNo: "—",
        delta,
        rule: "冻结额度合计不得超过卡片余额",
        detail: `余额 ¥${card.balance.toFixed(2)}，未结冻结 ¥${frozen.toFixed(2)}，差额 ${delta.toFixed(2)}`
      });
    }
  }

  // 2. 授权引用：卡号 / 油枪 / 班次必须存在
  for (const a of db.auths) {
    if (!db.cards.some((c) => c.cardNo === a.cardNo)) {
      push(conflicts, {
        key: `auth-missing-card-${a.id}`,
        cardNo: a.cardNo,
        pumpNo: a.pumpNo,
        delta: null,
        rule: "授权卡号必须存在于卡片资料",
        detail: `授权 ${a.id} 引用的卡 ${a.cardNo} 不存在`
      });
    }
    if (!db.pumps.some((p) => p.no === a.pumpNo)) {
      push(conflicts, {
        key: `auth-missing-pump-${a.id}`,
        cardNo: a.cardNo,
        pumpNo: a.pumpNo,
        delta: null,
        rule: "授权油枪号必须存在于油枪资料",
        detail: `授权 ${a.id} 引用的油枪 ${a.pumpNo} 不存在`
      });
    }
    for (const sid of [a.createdShiftId, a.ownerShiftId]) {
      if (sid && !db.shifts.some((s) => s.id === sid)) {
        push(conflicts, {
          key: `auth-missing-shift-${a.id}-${sid}`,
          cardNo: a.cardNo,
          pumpNo: a.pumpNo,
          delta: null,
          rule: "授权归属班次必须存在",
          detail: `授权 ${a.id} 引用的班次 ${sid} 不存在`
        });
      }
    }
  }

  // 3. 同卡 / 同枪不得有多条未结授权
  for (const card of db.cards) {
    const open = db.auths.filter((a) => a.cardNo === card.cardNo && a.status === "frozen");
    if (open.length > 1) {
      const extra = open.length - 1;
      push(conflicts, {
        key: `card-multi-open-${card.cardNo}`,
        cardNo: card.cardNo,
        pumpNo: open.map((a) => `枪${a.pumpNo}`).join("、"),
        delta: extra,
        rule: "同卡有未结授权不得再次开泵",
        detail: `卡号 ${card.cardNo} 存在 ${open.length} 条未结授权（${open
          .map((a) => a.id)
          .join("、")}），超出 ${extra} 条`
      });
    }
  }
  for (const pump of db.pumps) {
    const open = db.auths.filter((a) => a.pumpNo === pump.no && a.status === "frozen");
    if (open.length > 1) {
      push(conflicts, {
        key: `pump-multi-open-${pump.no}`,
        cardNo: open.map((a) => a.cardNo).join("、"),
        pumpNo: pump.no,
        delta: open.length - 1,
        rule: "同一油枪同时只能有一条未结授权",
        detail: `油枪 ${pump.no} 存在 ${open.length} 条未结授权`
      });
    }
  }

  // 4. 已关班不得仍持有未结授权；开班数量唯一
  for (const shift of db.shifts) {
    if (shift.status === "closed") {
      const held = db.auths.filter((a) => a.status === "frozen" && a.ownerShiftId === shift.id);
      if (held.length > 0) {
        push(conflicts, {
          key: `closed-shift-holds-${shift.id}`,
          cardNo: held.map((a) => a.cardNo).join("、"),
          pumpNo: held.map((a) => `枪${a.pumpNo}`).join("、"),
          delta: held.length,
          rule: "处理完未结授权前不得关班",
          detail: `${shift.name} 已关班，但仍持有 ${held.length} 条未结授权`
        });
      }
    }
  }
  const openShifts = db.shifts.filter((s) => s.status === "open");
  if (openShifts.length > 1) {
    push(conflicts, {
      key: "multiple-open-shifts",
      cardNo: "—",
      pumpNo: "—",
      delta: openShifts.length - 1,
      rule: "同时只能有一个开班",
      detail: `存在 ${openShifts.length} 个开班：${openShifts.map((s) => s.name).join("、")}`
    });
  }

  // 5. 无主授权只能出现在“无开班”时（上一班已关、下一班未开的挂账窗口）
  const orphan = db.auths.filter((a) => a.status === "frozen" && a.ownerShiftId === null);
  if (orphan.length > 0 && openShifts.length === 1) {
    push(conflicts, {
      key: "orphan-auths",
      cardNo: orphan.map((a) => a.cardNo).join("、"),
      pumpNo: orphan.map((a) => `枪${a.pumpNo}`).join("、"),
      delta: orphan.length,
      rule: "开班须接手全部跨班挂账授权",
      detail: `已有开班 ${openShifts[0].name}，但 ${orphan.length} 条授权未被接手`
    });
  }

  // 6. 版本：每条授权至少 1 个版本，且最新版本快照必须与授权当前资料一致
  for (const a of db.auths) {
    const versions = db.versions
      .filter((v) => v.authId === a.id)
      .sort((x, y) => x.version - y.version);
    if (versions.length === 0) {
      push(conflicts, {
        key: `no-version-${a.id}`,
        cardNo: a.cardNo,
        pumpNo: a.pumpNo,
        delta: null,
        rule: "授权必须保留版本记录",
        detail: `授权 ${a.id} 无任何版本`
      });
      continue;
    }
    const latest = versions[versions.length - 1].snapshot;
    if (
      round2(latest.amount) !== round2(a.amount) ||
      latest.pumpNo !== a.pumpNo ||
      latest.plate !== a.plate ||
      latest.status !== a.status
    ) {
      const delta = round2(a.amount - latest.amount);
      push(conflicts, {
        key: `version-drift-${a.id}`,
        cardNo: a.cardNo,
        pumpNo: a.pumpNo,
        delta,
        rule: "授权最新版本快照须与当前资料一致",
        detail: `授权 ${a.id} 当前（${a.amount}/${a.pumpNo}/${a.plate}/${a.status}）与 v${
          versions.length
        } 快照（${latest.amount}/${latest.pumpNo}/${latest.plate}/${latest.status}）不符`
      });
    }
  }

  // 7. 已结清授权必须有结算记录，且补收 + 卡扣 = 结算额
  for (const a of db.auths) {
    if (a.status === "settled") {
      if (!a.settlement) {
        push(conflicts, {
          key: `settled-without-info-${a.id}`,
          cardNo: a.cardNo,
          pumpNo: a.pumpNo,
          delta: null,
          rule: "结清后冻结须保留结算记录",
          detail: `授权 ${a.id} 已结清但缺少结算记录`
        });
        continue;
      }
      const s = a.settlement;
      const delta = round2(s.extraCollected + s.cardCharged - s.finalAmount);
      if (Math.abs(delta) > Number.EPSILON) {
        push(conflicts, {
          key: `settle-sum-${a.id}`,
          cardNo: a.cardNo,
          pumpNo: a.pumpNo,
          delta,
          rule: "补收金额 + 卡内扣款必须等于结算额",
          detail: `授权 ${a.id}：补收 ${s.extraCollected} + 卡扣 ${s.cardCharged} ≠ 结算 ${s.finalAmount}`
        });
      }
    }
  }

  return conflicts;
}
