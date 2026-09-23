import type { Authorization, FuelCard } from "../domain/types";
import { round2 } from "../domain/money";

/** 卡片当前可用余额：卡内余额减去该卡全部未结预授权冻结额度 */
export function availableBalance(card: FuelCard, all: readonly Authorization[]): number {
  const frozen = all
    .filter((a) => a.cardNo === card.cardNo && a.status === "open")
    .reduce((sum, a) => sum + a.frozenAmount, 0);
  return round2(card.balance - frozen);
}
