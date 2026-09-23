// 存储层：只负责 StationState 的持久化读写与种子数据，不包含任何业务判定
import type { StationState } from "../domain/types";
import { seedState } from "./seed";

export const STORAGE_KEY = "gas-station-preauth-state-v1";

export const repository = {
  load(): StationState {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = seedState();
      this.save(seed);
      return seed;
    }
    try {
      const parsed = JSON.parse(raw) as StationState;
      if (!parsed.cards || !parsed.authorizations || !parsed.shifts) {
        throw new Error("数据结构不完整");
      }
      return parsed;
    } catch {
      return seedState();
    }
  },

  save(state: StationState): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, meta: { ...state.meta, savedAt: new Date().toISOString() } })
    );
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  /** 演示：直接改写底层数据，模拟关站重开后发现卡片/授权/班次/版本被破坏 */
  tamper(): StationState {
    const state = this.load();
    const open = state.authorizations.find((a) => a.status === "open");
    const card = state.cards.find((c) => c.cardNo === "C-1001");
    if (card) card.balance = 200; // 让结清授权所在卡余额看起来异常
    if (open) {
      open.frozenAmount = open.frozenAmount + 300; // 改动未另存版本 → 触发版本冲突
    }
    this.save(state);
    return state;
  }
};
