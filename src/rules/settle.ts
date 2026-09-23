import type { Authorization } from "../domain/types";
import { round2 } from "../domain/money";
import { reject, succeed, type Result } from "./result";

/** 结清该授权还需补收的金额：实际额超过冻结额且超过已补收时，差额为正 */
export function requiredExtra(auth: Authorization, finalAmount: number): number {
  return Math.max(0, round2(finalAmount - auth.frozenAmount - auth.extraCollected));
}

export interface SettleDecision {
  finalAmount: number;
  need: number;
  /** true=可直接结清；false=必须先补收差额 */
  canSettle: boolean;
}

/**
 * 结算判定：实际金额 ≤ 冻结+已补收 才能结清；
 * 超过预授额时只能先补收，补够后方可结清。
 */
export function judgeSettle(auth: Authorization, finalAmount: number): Result<SettleDecision> {
  if (auth.status !== "open") {
    return reject("AUTH_NOT_OPEN", "该授权已结清，不能重复结算");
  }
  const final = round2(finalAmount);
  if (!(final > 0)) {
    return reject("INVALID_FINAL", "实际结算金额必须大于 0");
  }
  const need = requiredExtra(auth, final);
  return succeed({ finalAmount: final, need, canSettle: need === 0 });
}

/** 补收判定：补收额必须为正，且累计补收不得超过实际超出预授额的差额 */
export function judgeExtra(
  auth: Authorization,
  finalAmount: number,
  pay: number
): Result<{ pay: number; remaining: number }> {
  const settle = judgeSettle(auth, finalAmount);
  if (!settle.ok) return reject(settle.code, settle.reason);

  const amount = round2(pay);
  if (!(amount > 0)) {
    return reject("INVALID_EXTRA", "补收金额必须大于 0");
  }
  if (amount > settle.data.need) {
    return reject(
      "EXTRA_OVERFLOW",
      `最多还需补收 ¥${settle.data.need.toFixed(2)}，不能多收`
    );
  }
  return succeed({ pay: amount, remaining: round2(settle.data.need - amount) });
}
