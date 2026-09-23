import type { AuthSnapshot, Authorization } from "../domain/types";
import { round2 } from "../domain/money";
import { reject, succeed, type Result } from "./result";

export interface AdjustInput {
  finalAmount: number;
  reason: string;
}

/** 取授权当前快照（版本一致性核对依据） */
export function snapshotOf(auth: Authorization): AuthSnapshot {
  return {
    status: auth.status,
    plate: auth.plate,
    nozzle: auth.nozzle,
    frozenAmount: auth.frozenAmount,
    finalAmount: auth.finalAmount,
    extraCollected: auth.extraCollected
  };
}

/**
 * 结清后金额调整判定：必须带原因；结清后冻结额不变，仅允许调整结算金额。
 * 调整后金额必须为正且累计补收不得超过新的超出差额。
 */
export function judgeAdjust(auth: Authorization, input: AdjustInput): Result<{ finalAmount: number }> {
  if (auth.status !== "settled") {
    return reject("AUTH_NOT_SETTLED", "只有已结清的授权才能做调整");
  }
  const reason = input.reason.trim();
  if (!reason) {
    return reject("REASON_REQUIRED", "调整必须填写原因");
  }
  const finalAmount = round2(input.finalAmount);
  if (!(finalAmount > 0)) {
    return reject("INVALID_FINAL", "调整后金额必须大于 0");
  }
  const over = Math.max(0, round2(finalAmount - auth.frozenAmount));
  if (auth.extraCollected - over > 0.0001) {
    return reject(
      "EXTRA_EXCEEDS",
      `已补收 ¥${auth.extraCollected.toFixed(2)} 超出调整后可补收上限 ¥${over.toFixed(2)}，不能调减结算额`
    );
  }
  return succeed({ finalAmount });
}
