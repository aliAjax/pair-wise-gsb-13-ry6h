// 状态编排：页面只调用这里；内部串联 判定层(rules) + 存储层(storage)
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  AuthVersionRecord,
  Conflict,
  Database,
  FuelCard,
  PreAuth,
  Pump,
  Shift
} from "../domain/types";
import { round2 } from "../domain/money";
import {
  evaluateAdjust,
  evaluateCloseShift,
  evaluateOpenAuth,
  evaluateSettle,
  type AdjustInput,
  type OpenAuthInput
} from "../rules";
import { detectConflicts } from "../rules/consistency";
import {
  loadDatabase,
  loadOperator,
  resetDatabase,
  saveDatabase,
  saveOperator
} from "../storage/repository";

interface ActionResult {
  ok: boolean;
  message?: string;
}

export const useStationStore = defineStore("station", () => {
  const cards = ref<FuelCard[]>([]);
  const pumps = ref<Pump[]>([]);
  const auths = ref<PreAuth[]>([]);
  const shifts = ref<Shift[]>([]);
  const versions = ref<AuthVersionRecord[]>([]);
  const operator = ref(loadOperator());
  const conflicts = ref<Conflict[]>([]);

  const currentShift = computed<Shift | undefined>(() => shifts.value.find((s) => s.status === "open"));
  const sortedShifts = computed(() => [...shifts.value].sort((a, b) => b.openedAt.localeCompare(a.openedAt)));
  const db = computed<Database>(() => ({
    cards: cards.value,
    pumps: pumps.value,
    auths: auths.value,
    shifts: shifts.value,
    versions: versions.value
  }));

  function toDb(): Database {
    return db.value;
  }

  function commit(next: Database) {
    cards.value = next.cards;
    pumps.value = next.pumps;
    auths.value = next.auths;
    shifts.value = next.shifts;
    versions.value = next.versions;
    saveDatabase(next);
    conflicts.value = detectConflicts(next);
  }

  function reload() {
    commit(loadDatabase());
  }

  function setOperator(name: string) {
    operator.value = name;
    saveOperator(name);
  }

  function nextVersionNo(authId: string): number {
    return versions.value.filter((v) => v.authId === authId).length + 1;
  }

  function appendVersion(
    db: Database,
    auth: PreAuth,
    reason: string,
    at: string,
    op: string
  ): AuthVersionRecord {
    const record: AuthVersionRecord = {
      authId: auth.id,
      version: db.versions.filter((v) => v.authId === auth.id).length + 1,
      reason,
      at,
      operator: op,
      snapshot: {
        amount: auth.amount,
        pumpNo: auth.pumpNo,
        plate: auth.plate,
        status: auth.status
      }
    };
    db.versions.push(record);
    return record;
  }

  // 开泵预授权
  function openAuth(input: OpenAuthInput): ActionResult {
    const db = toDb();
    const verdict = evaluateOpenAuth(db, {
      cardNo: input.cardNo.trim(),
      pumpNo: input.pumpNo.trim(),
      plate: input.plate.trim(),
      amount: round2(input.amount)
    });
    if (!verdict.ok) return { ok: false, message: verdict.message };

    const shift = db.shifts.find((s) => s.status === "open");
    const now = new Date().toISOString();
    const seq = db.auths.length + 1;
    const auth: PreAuth = {
      id: `A-${String(1000 + seq)}`,
      cardNo: input.cardNo.trim(),
      pumpNo: input.pumpNo.trim(),
      plate: input.plate.trim(),
      amount: round2(input.amount),
      status: "frozen",
      createdAt: now,
      createdShiftId: shift!.id,
      ownerShiftId: shift!.id,
      handoverTrail: []
    };
    db.auths.unshift(auth);
    appendVersion(db, auth, "开泵冻结", now, operator.value);
    commit(db);
    return { ok: true };
  }

  // 结算（超额补收后结清，结清即冻结）
  function settle(authId: string, finalAmount: number, extraPaid: number): ActionResult {
    const db = toDb();
    const auth = db.auths.find((a) => a.id === authId);
    if (!auth) return { ok: false, message: "授权不存在" };

    const verdict = evaluateSettle(auth, round2(finalAmount), round2(extraPaid));
    if (!verdict.ok) return { ok: false, message: verdict.message };

    const card = db.cards.find((c) => c.cardNo === auth.cardNo);
    if (!card) return { ok: false, message: "卡片资料缺失" };

    const now = new Date().toISOString();
    card.balance = round2(card.balance - verdict.cardCharge);
    auth.status = "settled";
    auth.settlement = {
      finalAmount: round2(finalAmount),
      authAmount: auth.amount,
      extraCollected: verdict.extraNeeded,
      cardCharged: verdict.cardCharge,
      at: now,
      shiftId: auth.ownerShiftId ?? "—",
      operator: operator.value
    };
    appendVersion(
      db,
      auth,
      verdict.extraNeeded > 0
        ? `结清冻结：超预授 ¥${verdict.extraNeeded.toFixed(2)} 已补收`
        : "结清冻结",
      now,
      operator.value
    );
    commit(db);
    return { ok: true };
  }

  // 调整：带原因另存版本
  function adjust(authId: string, next: AdjustInput): ActionResult {
    const db = toDb();
    const auth = db.auths.find((a) => a.id === authId);
    if (!auth) return { ok: false, message: "授权不存在" };

    const payload = {
      amount: round2(next.amount),
      pumpNo: next.pumpNo.trim(),
      plate: next.plate.trim(),
      reason: next.reason.trim()
    };
    const verdict = evaluateAdjust(db, auth, payload);
    if (!verdict.ok) return { ok: false, message: verdict.message };

    auth.amount = payload.amount;
    auth.pumpNo = payload.pumpNo;
    auth.plate = payload.plate;
    appendVersion(db, auth, payload.reason, new Date().toISOString(), operator.value);
    commit(db);
    return { ok: true };
  }

  // 关班：未结授权逐条写处理办法，挂账到跨班窗口
  function closeShift(notes: Record<string, string>): ActionResult {
    const db = toDb();
    const shift = db.shifts.find((s) => s.status === "open");
    if (!shift) return { ok: false, message: "当前无开班" };

    const verdict = evaluateCloseShift(db, shift.id, notes);
    if (!verdict.canClose) return { ok: false, message: "仍有未结授权未填写跨班交接处理办法" };

    const now = new Date().toISOString();
    for (const auth of db.auths.filter((a) => a.status === "frozen" && a.ownerShiftId === shift.id)) {
      auth.handoverTrail.push({
        shiftId: shift.id,
        shiftName: shift.name,
        note: notes[auth.id].trim(),
        at: now
      });
      // 进入跨班挂账窗口，等待下一班接手
      auth.ownerShiftId = null;
    }
    shift.status = "closed";
    shift.closedAt = now;
    commit(db);
    return { ok: true };
  }

  // 开班：接手全部跨班挂账授权
  function openShift(name: string): ActionResult {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, message: "请填写班次名称" };
    const db = toDb();
    if (db.shifts.some((s) => s.status === "open")) return { ok: false, message: "已有开班，请先关班" };

    const shift: Shift = {
      id: `S-${Date.now()}`,
      name: trimmed,
      openedAt: new Date().toISOString(),
      status: "open"
    };
    db.shifts.unshift(shift);
    for (const auth of db.auths.filter((a) => a.status === "frozen" && a.ownerShiftId === null)) {
      auth.ownerShiftId = shift.id;
    }
    commit(db);
    return { ok: true };
  }

  function recharge(cardNo: string, amount: number): ActionResult {
    if (!(amount > 0)) return { ok: false, message: "充值金额必须大于 0" };
    const db = toDb();
    const card = db.cards.find((c) => c.cardNo === cardNo);
    if (!card) return { ok: false, message: "卡片不存在" };
    card.balance = round2(card.balance + amount);
    commit(db);
    return { ok: true };
  }

  function setCardStatus(cardNo: string, status: FuelCard["status"]): ActionResult {
    const db = toDb();
    const card = db.cards.find((c) => c.cardNo === cardNo);
    if (!card) return { ok: false, message: "卡片不存在" };
    card.status = status;
    commit(db);
    return { ok: true };
  }

  function resetDemo(): ActionResult {
    commit(resetDatabase());
    return { ok: true };
  }

  function versionsOf(authId: string): AuthVersionRecord[] {
    return versions.value
      .filter((v) => v.authId === authId)
      .sort((a, b) => b.version - a.version);
  }

  function pendingAuths(shiftId: string | null | undefined): PreAuth[] {
    if (!shiftId) return [];
    return auths.value.filter((a) => a.status === "frozen" && a.ownerShiftId === shiftId);
  }

  function pumpLabel(no: string): string {
    const pump = pumps.value.find((p) => p.no === no);
    return pump ? `${no}号枪 · ${pump.fuel}` : `${no}号枪（资料缺失）`;
  }

  reload();

  return {
    cards,
    pumps,
    auths,
    shifts,
    versions,
    operator,
    conflicts,
    currentShift,
    sortedShifts,
    db,
    reload,
    setOperator,
    openAuth,
    settle,
    adjust,
    closeShift,
    openShift,
    recharge,
    setCardStatus,
    resetDemo,
    versionsOf,
    pendingAuths,
    pumpLabel
  };
});
