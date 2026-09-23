import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { Authorization, FuelCard, Shift, StationState } from "../domain/types";
import { round2 } from "../domain/money";
import { uid, fmtTime } from "../domain/id";
import { nextShiftName } from "../domain/shiftNames";
import { availableBalance } from "../rules/accounts";
import { judgeOpenPump, type OpenPumpInput } from "../rules/openPump";
import { judgeSettle, judgeExtra, requiredExtra } from "../rules/settle";
import { judgeAdjust, snapshotOf } from "../rules/adjust";
import { judgeCloseShift, type CloseShiftPlan } from "../rules/shifts";
import { checkConsistency } from "../rules/consistency";
import { repository } from "../storage/repository";
import { seedState } from "../storage/seed";
import type { Result } from "../rules/result";

export const useStationStore = defineStore("station", () => {
  const state = ref<StationState>(repository.load());

  function persist() {
    repository.save(state.value);
  }

  const cards = computed(() => state.value.cards);
  const authorizations = computed(() => state.value.authorizations);
  const shifts = computed(() => state.value.shifts);
  const openShifts = computed(() => state.value.shifts.filter((s) => s.status === "open"));
  const currentShift = computed<Shift | undefined>(() =>
    [...state.value.shifts].reverse().find((s) => s.status === "open")
  );
  const openAuths = computed(() =>
    state.value.authorizations.filter((a) => a.status === "open")
  );
  const conflicts = computed(() => checkConsistency(state.value));
  const savedAt = computed(() => fmtTime(state.value.meta.savedAt));

  function cardByNo(cardNo: string): FuelCard | undefined {
    return state.value.cards.find((c) => c.cardNo === cardNo);
  }
  function shiftById(id: string): Shift | undefined {
    return state.value.shifts.find((s) => s.id === id);
  }
  function availableOf(cardNo: string): number {
    const card = cardByNo(cardNo);
    return card ? availableBalance(card, state.value.authorizations) : 0;
  }
  function requiredExtraOf(auth: Authorization, finalAmount: number): number {
    return requiredExtra(auth, finalAmount);
  }

  /** 开泵：预授权冻结 */
  function openPump(input: OpenPumpInput): Result<Authorization> {
    const decision = judgeOpenPump(input, state.value.cards, state.value.authorizations);
    if (!decision.ok) return decision;
    const shift = currentShift.value;
    if (!shift) {
      return { ok: false, code: "NO_OPEN_SHIFT", reason: "当前没有在班班次，无法开泵" };
    }
    const now = new Date().toISOString();
    const auth: Authorization = {
      id: uid("AUTH"),
      cardNo: input.cardNo,
      nozzle: input.nozzle,
      plate: input.plate,
      frozenAmount: decision.data.frozenAmount,
      status: "open",
      openedShiftId: shift.id,
      ownerShiftId: shift.id,
      createdAt: now,
      settledAt: null,
      settledShiftId: null,
      finalAmount: null,
      extraCollected: 0,
      extraPayments: [],
      versions: [
        {
          version: 1,
          action: "freeze",
          reason: `开泵预授权冻结 ¥${decision.data.frozenAmount.toFixed(2)}`,
          at: now,
          operatorShiftId: shift.id,
          snapshot: {
            status: "open",
            plate: input.plate,
            nozzle: input.nozzle,
            frozenAmount: decision.data.frozenAmount,
            finalAmount: null,
            extraCollected: 0
          }
        }
      ]
    };
    state.value.authorizations.push(auth);
    persist();
    return { ok: true, data: auth };
  }

  /** 部分补收（超过预授额时，补够前不能结清） */
  function collectExtra(auth: Authorization, finalAmount: number, pay: number): Result<number> {
    const decision = judgeExtra(auth, finalAmount, pay);
    if (!decision.ok) return decision;
    auth.extraCollected = round2(auth.extraCollected + decision.data.pay);
    auth.extraPayments.push({ amount: decision.data.pay, at: new Date().toISOString() });
    persist();
    return { ok: true, data: decision.data.remaining };
  }

  /** 结清：释放冻结，按实际额扣款 */
  function settle(auth: Authorization, finalAmount: number): Result<Authorization> {
    const decision = judgeSettle(auth, finalAmount);
    if (!decision.ok) return decision;
    if (!decision.data.canSettle) {
      return {
        ok: false,
        code: "EXTRA_REQUIRED",
        reason: `实际额超出预授 ¥${decision.data.need.toFixed(2)}，必须先补收差额后才能结清`
      };
    }

    const card = cardByNo(auth.cardNo);
    if (!card) {
      return { ok: false, code: "CARD_NOT_FOUND", reason: "授权卡片不存在，无法扣款结清" };
    }
    const now = new Date().toISOString();
    const shiftId = currentShift.value?.id ?? auth.ownerShiftId;

    card.balance = round2(card.balance - decision.data.finalAmount);
    auth.status = "settled";
    auth.finalAmount = decision.data.finalAmount;
    auth.settledAt = now;
    auth.settledShiftId = shiftId;
    auth.versions.push({
      version: auth.versions.length + 1,
      action: "settle",
      reason:
        auth.extraCollected > 0
          ? `实际 ${decision.data.finalAmount} 元超预授，已补收 ¥${auth.extraCollected.toFixed(2)} 后结清`
          : `实际 ${decision.data.finalAmount} 元，未超预授额，结清并释放冻结`,
      at: now,
      operatorShiftId: shiftId,
      snapshot: snapshotOf(auth)
    });
    persist();
    return { ok: true, data: auth };
  }

  /** 结清后调整：带原因另存版本，按差额补扣/退回卡余额 */
  function adjustSettled(
    auth: Authorization,
    finalAmount: number,
    reason: string
  ): Result<Authorization> {
    const decision = judgeAdjust(auth, { finalAmount, reason });
    if (!decision.ok) return decision;
    const card = cardByNo(auth.cardNo);
    if (!card) {
      return { ok: false, code: "CARD_NOT_FOUND", reason: "授权卡片不存在，无法调整扣款" };
    }
    const diff = round2(decision.data.finalAmount - (auth.finalAmount ?? 0));
    card.balance = round2(card.balance - diff);
    auth.finalAmount = decision.data.finalAmount;
    const shiftId = currentShift.value?.id ?? auth.ownerShiftId;
    auth.versions.push({
      version: auth.versions.length + 1,
      action: "adjust",
      reason: reason.trim(),
      at: new Date().toISOString(),
      operatorShiftId: shiftId,
      snapshot: snapshotOf(auth)
    });
    persist();
    return { ok: true, data: auth };
  }

  function createShift(name: string): Shift {
    const shift: Shift = {
      id: uid("SHIFT"),
      name: name.trim(),
      startedAt: new Date().toISOString(),
      status: "open",
      closedAt: null,
      handover: null
    };
    state.value.shifts.push(shift);
    persist();
    return shift;
  }

  /** 关班：有未结授权必须先写处理办法并指定接班班次完成交接 */
  function closeShift(shiftId: string, plan: CloseShiftPlan): Result<Shift> {
    const shift = shiftById(shiftId);
    if (!shift) return { ok: false, code: "SHIFT_NOT_FOUND", reason: "班次不存在" };

    let toShiftId = plan.toShiftId;
    if (toShiftId === "__new__") {
      toShiftId = createShift(nextShiftName(shift.name)).id;
    }

    const decision = judgeCloseShift(
      shift,
      state.value.authorizations.filter((a) => a.status === "open"),
      { ...plan, toShiftId }
    );
    if (!decision.ok) return decision;

    const mine = state.value.authorizations.filter(
      (a) => a.status === "open" && a.ownerShiftId === shift.id
    );
    const now = new Date().toISOString();
    if (decision.data.handoverRequired) {
      shift.handover = {
        toShiftId,
        authIds: mine.map((a) => a.id),
        handling: plan.handling.trim(),
        at: now
      };
      for (const a of mine) {
        a.ownerShiftId = toShiftId;
      }
    }
    shift.status = "closed";
    shift.closedAt = now;
    persist();
    return { ok: true, data: shift };
  }

  function reportLost(card: FuelCard) {
    card.status = "lost";
    persist();
  }
  function restoreCard(card: FuelCard) {
    card.status = "normal";
    persist();
  }
  function topUp(card: FuelCard, amount: number): Result<FuelCard> {
    const value = round2(amount);
    if (!(value > 0)) {
      return { ok: false, code: "INVALID_AMOUNT", reason: "充值金额必须大于 0" };
    }
    card.balance = round2(card.balance + value);
    persist();
    return { ok: true, data: card };
  }

  function reload() {
    state.value = repository.load();
  }
  function resetAll() {
    repository.clear();
    state.value = seedState();
    persist();
  }
  function injectConflict() {
    state.value = repository.tamper();
  }

  return {
    // state
    state,
    cards,
    authorizations,
    shifts,
    openShifts,
    currentShift,
    openAuths,
    conflicts,
    savedAt,
    // lookups
    cardByNo,
    shiftById,
    availableOf,
    requiredExtraOf,
    // actions
    openPump,
    collectExtra,
    settle,
    adjustSettled,
    createShift,
    closeShift,
    reportLost,
    restoreCard,
    topUp,
    reload,
    resetAll,
    injectConflict
  };
});
