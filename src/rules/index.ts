// 判定层：全部为纯函数，输入授权资料与业务单据，输出判定结果
import type { Database, FuelCard, PreAuth } from "../domain/types";
import { round2 } from "../domain/money";

/** 规则编码 -> 页面展示的规则名称（冲突提示、拒绝提示共用） */
export const RULES = {
  INPUT_INCOMPLETE: "开泵信息须完整（卡号/油枪/车牌/额度）",
  CARD_LOST: "挂失卡禁止开泵",
  PLATE_MISMATCH: "录入车牌必须与卡片绑定车牌一致",
  OPEN_AUTH_EXISTS: "同卡有未结授权时不得再次开泵",
  INSUFFICIENT_BALANCE: "可用余额不足，无法冻结",
  PUMP_BUSY: "油枪已有未结授权占用",
  NO_OPEN_SHIFT: "当前无开班，不能开泵",
  AUTH_NOT_FROZEN: "仅未结（冻结中）授权可处理",
  SETTLE_POSITIVE: "结算金额必须大于 0",
  EXTRA_REQUIRED: "结算超过预授额，必须补收差额后方可结清",
  ADJUST_REASON: "调整必须填写原因",
  ADJUST_NO_CHANGE: "调整内容与现行授权一致，无需另存版本"
} as const;

export type RuleCode = keyof typeof RULES;

export interface OpenAuthInput {
  cardNo: string;
  pumpNo: string;
  plate: string;
  amount: number;
}

export type EvalResult<T> =
  | ({ ok: true } & T)
  | { ok: false; ruleCode: RuleCode; message: string };

/** 车牌规范化：去空格、分隔符，转大写，支持汉字省份简称 */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s·.\-]/g, "").toUpperCase();
}

/** 该卡当前冻结占用金额（未结授权合计） */
export function frozenAmountForCard(db: Database, cardNo: string): number {
  return round2(
    db.auths
      .filter((a) => a.cardNo === cardNo && a.status === "frozen")
      .reduce((sum, a) => sum + a.amount, 0)
  );
}

/** 卡可用余额 = 余额 - 未结冻结 */
export function availableBalance(db: Database, card: FuelCard): number {
  return round2(card.balance - frozenAmountForCard(db, card.cardNo));
}

export function pumpBusy(db: Database, pumpNo: string, exceptAuthId?: string): boolean {
  return db.auths.some(
    (a) => a.status === "frozen" && a.pumpNo === pumpNo && a.id !== exceptAuthId
  );
}

/** 开泵前判定：卡号、油枪、车牌、额度 */
export function evaluateOpenAuth(db: Database, input: OpenAuthInput): EvalResult<object> {
  const fail = (ruleCode: RuleCode) => ({ ok: false as const, ruleCode, message: RULES[ruleCode] });

  if (
    !input.cardNo.trim() ||
    !input.pumpNo.trim() ||
    !input.plate.trim() ||
    !(input.amount > 0)
  ) {
    return fail("INPUT_INCOMPLETE");
  }
  if (!db.shifts.some((s) => s.status === "open")) return fail("NO_OPEN_SHIFT");

  const card = db.cards.find((c) => c.cardNo === input.cardNo.trim());
  if (!card) return fail("INPUT_INCOMPLETE");
  if (card.status === "lost") return fail("CARD_LOST");
  if (normalizePlate(input.plate) !== normalizePlate(card.plate)) return fail("PLATE_MISMATCH");

  const hasOpen = db.auths.some((a) => a.cardNo === card.cardNo && a.status === "frozen");
  if (hasOpen) return fail("OPEN_AUTH_EXISTS");

  if (pumpBusy(db, input.pumpNo.trim())) return fail("PUMP_BUSY");

  const available = availableBalance(db, card);
  if (available + Number.EPSILON < input.amount) return fail("INSUFFICIENT_BALANCE");

  return { ok: true };
}

/**
 * 结算判定：结算额超过预授额时，只能补收后结清。
 * @param extraPaid 已向客户补收的金额（现金/扫码等卡外方式）
 */
export function evaluateSettle(
  auth: PreAuth,
  finalAmount: number,
  extraPaid: number
): EvalResult<{ cardCharge: number; extraNeeded: number }> {
  const fail = (ruleCode: RuleCode) => ({ ok: false as const, ruleCode, message: RULES[ruleCode] });
  if (auth.status !== "frozen") return fail("AUTH_NOT_FROZEN");
  if (!(finalAmount > 0)) return fail("SETTLE_POSITIVE");

  const over = round2(Math.max(0, finalAmount - auth.amount));
  if (over > 0 && round2(extraPaid) + Number.EPSILON < over) return fail("EXTRA_REQUIRED");

  // 超预授部分走补收，卡内最多扣预授权额
  return { ok: true, cardCharge: Math.min(auth.amount, finalAmount), extraNeeded: over };
}

export interface AdjustInput {
  amount: number;
  pumpNo: string;
  plate: string;
  reason: string;
}

/** 调整判定：必须有原因且内容确有变化 */
export function evaluateAdjust(
  db: Database,
  auth: PreAuth,
  next: AdjustInput
): EvalResult<object> {
  const fail = (ruleCode: RuleCode) => ({ ok: false as const, ruleCode, message: RULES[ruleCode] });
  if (auth.status !== "frozen") return fail("AUTH_NOT_FROZEN");
  if (!next.reason.trim()) return fail("ADJUST_REASON");
  if (!(next.amount > 0)) return fail("INPUT_INCOMPLETE");

  const changed =
    round2(next.amount) !== round2(auth.amount) ||
    next.pumpNo !== auth.pumpNo ||
    normalizePlate(next.plate) !== normalizePlate(auth.plate);
  if (!changed) return fail("ADJUST_NO_CHANGE");

  const card = db.cards.find((c) => c.cardNo === auth.cardNo);
  if (card) {
    const others = db.auths
      .filter((a) => a.status === "frozen" && a.cardNo === card.cardNo && a.id !== auth.id)
      .reduce((sum, a) => sum + a.amount, 0);
    if (round2(card.balance - others) + Number.EPSILON < next.amount) {
      return fail("INSUFFICIENT_BALANCE");
    }
  }
  if (pumpBusy(db, next.pumpNo, auth.id)) return fail("PUMP_BUSY");

  return { ok: true };
}

/** 关班判定：有未结授权时，每条都必须填写跨班交接处理办法 */
export function evaluateCloseShift(db: Database, shiftId: string, notes: Record<string, string>) {
  const pending = db.auths.filter((a) => a.status === "frozen" && a.ownerShiftId === shiftId);
  const missing = pending
    .filter((a) => !notes[a.id] || !notes[a.id].trim())
    .map((a) => a.id);
  return { pendingCount: pending.length, canClose: missing.length === 0, missing };
}
