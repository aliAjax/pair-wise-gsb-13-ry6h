// 领域模型：授权资料、预授权、班次、版本的数据结构

export type CardStatus = "normal" | "lost";

/** 加油卡（授权资料） */
export interface FuelCard {
  cardNo: string;
  holder: string;
  /** 绑定车牌 */
  plate: string;
  /** 账户余额（结算扣款后更新） */
  balance: number;
  status: CardStatus;
}

/** 油枪（授权资料） */
export interface Pump {
  no: string;
  fuel: string;
}

export type AuthStatus = "frozen" | "settled";

/** 授权资料的版本快照：调整时整份另存 */
export interface AuthSnapshot {
  amount: number;
  pumpNo: string;
  plate: string;
  status: AuthStatus;
}

/** 授权版本记录，独立于授权单存储 */
export interface AuthVersionRecord {
  authId: string;
  version: number;
  reason: string;
  at: string;
  operator: string;
  snapshot: AuthSnapshot;
}

/** 跨班交接记录（处理办法） */
export interface HandoverEntry {
  shiftId: string;
  shiftName: string;
  note: string;
  at: string;
}

export interface SettlementInfo {
  /** 实际结算额（加油金额） */
  finalAmount: number;
  /** 原预授权冻结额 */
  authAmount: number;
  /** 超预授额的补收金额 */
  extraCollected: number;
  /** 从卡内实扣金额 */
  cardCharged: number;
  at: string;
  shiftId: string;
  operator: string;
}

/** 预授权单 */
export interface PreAuth {
  id: string;
  cardNo: string;
  pumpNo: string;
  /** 开泵时录入的车牌 */
  plate: string;
  /** 冻结额度 */
  amount: number;
  status: AuthStatus;
  createdAt: string;
  /** 开泵所在班 */
  createdShiftId: string;
  /** 当前归属班；两班之间为 null（跨班挂账中） */
  ownerShiftId: string | null;
  /** 历次跨班交接处理办法 */
  handoverTrail: HandoverEntry[];
  settlement?: SettlementInfo;
}

export type ShiftStatus = "open" | "closed";

export interface Shift {
  id: string;
  /** 如：早班 2026-09-23 */
  name: string;
  openedAt: string;
  closedAt?: string;
  status: ShiftStatus;
}

export interface Database {
  cards: FuelCard[];
  pumps: Pump[];
  auths: PreAuth[];
  shifts: Shift[];
  versions: AuthVersionRecord[];
}

/** 冲突/不一致告警：页面固定展示 卡号、油枪、差额、规则 */
export interface Conflict {
  key: string;
  cardNo: string;
  pumpNo: string;
  /** 差额，无法量化时为 null */
  delta: number | null;
  rule: string;
  detail: string;
}
