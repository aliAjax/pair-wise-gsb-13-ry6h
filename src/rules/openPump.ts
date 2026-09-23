import type { Authorization, FuelCard } from "../domain/types";
import { round2 } from "../domain/money";
import { normalizePlate } from "../domain/plate";
import { availableBalance } from "./accounts";
import { reject, succeed, type Result } from "./result";

export interface OpenPumpInput {
  cardNo: string;
  nozzle: string;
  plate: string;
  frozenAmount: number;
}

export const REJECT_CODE = {
  INVALID_AMOUNT: "INVALID_AMOUNT",
  CARD_NOT_FOUND: "CARD_NOT_FOUND",
  CARD_LOST: "CARD_LOST",
  PLATE_MISMATCH: "PLATE_MISMATCH",
  CARD_BUSY: "CARD_BUSY",
  NOZZLE_BUSY: "NOZZLE_BUSY",
  INSUFFICIENT: "INSUFFICIENT"
} as const;

/**
 * 开泵前预授权冻结判定：
 * 挂失卡 / 车牌不符 / 同卡有未结授权 / 油枪被占用 / 可用余额不足 一律拒绝。
 * 冻结额度必须为正数。
 */
export function judgeOpenPump(
  input: OpenPumpInput,
  cards: readonly FuelCard[],
  auths: readonly Authorization[]
): Result<{ frozenAmount: number }> {
  const amount = round2(input.frozenAmount);
  if (!(amount > 0)) {
    return reject(REJECT_CODE.INVALID_AMOUNT, "冻结额度必须大于 0");
  }

  const card = cards.find((c) => c.cardNo === input.cardNo);
  if (!card) {
    return reject(REJECT_CODE.CARD_NOT_FOUND, `卡号 ${input.cardNo} 不存在`);
  }
  if (card.status === "lost") {
    return reject(REJECT_CODE.CARD_LOST, `卡号 ${input.cardNo} 已挂失，禁止开泵`);
  }
  if (normalizePlate(input.plate) !== normalizePlate(card.holderPlate)) {
    return reject(
      REJECT_CODE.PLATE_MISMATCH,
      `车牌 ${input.plate} 与卡片绑定车牌 ${card.holderPlate} 不符`
    );
  }

  const sameCardOpen = auths.find((a) => a.cardNo === card.cardNo && a.status === "open");
  if (sameCardOpen) {
    return reject(
      REJECT_CODE.CARD_BUSY,
      `卡号 ${card.cardNo} 在油枪 ${sameCardOpen.nozzle} 已有未结授权（${sameCardOpen.id}），不得再次开泵`
    );
  }

  const nozzleOpen = auths.find((a) => a.nozzle === input.nozzle && a.status === "open");
  if (nozzleOpen) {
    return reject(
      REJECT_CODE.NOZZLE_BUSY,
      `油枪 ${input.nozzle} 正被卡号 ${nozzleOpen.cardNo} 的未结授权占用`
    );
  }

  const available = availableBalance(card, auths);
  if (amount > available) {
    return reject(
      REJECT_CODE.INSUFFICIENT,
      `卡号 ${card.cardNo} 可用余额 ¥${available.toFixed(2)} 不足，本次需冻结 ¥${amount.toFixed(2)}`
    );
  }

  return succeed({ frozenAmount: amount });
}
