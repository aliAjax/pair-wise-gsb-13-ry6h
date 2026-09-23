import type { Authorization, Shift } from "../domain/types";
import { reject, succeed, type Result } from "./result";

export interface CloseShiftPlan {
  handling: string;
  toShiftId: string;
}

/**
 * 关班判定：
 * - 无未结授权：可直接关班；
 * - 有未结授权：必须写清处理办法并指定接班班次（跨班交接），否则不得关班。
 */
export function judgeCloseShift(
  shift: Shift,
  openAuths: readonly Authorization[],
  plan: CloseShiftPlan
): Result<{ handoverRequired: boolean }> {
  if (shift.status === "closed") {
    return reject("SHIFT_CLOSED", "该班次已关班");
  }
  const mine = openAuths.filter((a) => a.ownerShiftId === shift.id);
  if (mine.length === 0) {
    return succeed({ handoverRequired: false });
  }
  if (!plan.handling.trim()) {
    return reject(
      "HANDLING_REQUIRED",
      `本班还有 ${mine.length} 笔未结授权，必须写明处理办法并完成跨班交接，处理前不得关班`
    );
  }
  if (!plan.toShiftId) {
    return reject("TARGET_SHIFT_REQUIRED", "必须指定接班班次用于交接未结授权");
  }
  if (plan.toShiftId === shift.id) {
    return reject("TARGET_IS_SELF", "接班班次不能是本班");
  }
  return succeed({ handoverRequired: true });
}
