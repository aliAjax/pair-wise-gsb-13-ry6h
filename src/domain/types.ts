// 授权资料层：卡片、预授权、班次、版本的结构定义（不含任何判定与存储逻辑）

export type CardStatus = "normal" | "lost";

export interface FuelCard {
  /** 卡号 */
  cardNo: string;
  /** 卡片绑定车牌 */
  holderPlate: string;
  /** 卡内余额（元） */
  balance: number;
  /** 正常 / 挂失 */
  status: CardStatus;
  note?: string;
}

export type AuthStatus = "open" | "settled";

export interface AuthSnapshot {
  status: AuthStatus;
  plate: string;
  nozzle: string;
  frozenAmount: number;
  finalAmount: number | null;
  extraCollected: number;
}

export type VersionAction = "freeze" | "settle" | "adjust";

export interface AuthVersion {
  version: number;
  action: VersionAction;
  /** 调整原因（freeze/settle 为系统动作说明，adjust 必填人工原因） */
  reason: string;
  at: string;
  operatorShiftId: string;
  snapshot: AuthSnapshot;
}

export interface ExtraPayment {
  amount: number;
  at: string;
}

export interface Authorization {
  id: string;
  /** 卡号 */
  cardNo: string;
  /** 油枪编号 */
  nozzle: string;
  /** 开泵时登记的车牌 */
  plate: string;
  /** 预授权冻结额度 */
  frozenAmount: number;
  status: AuthStatus;
  /** 开泵班次 */
  openedShiftId: string;
  /** 当前归属班次（跨班交接后更新） */
  ownerShiftId: string;
  createdAt: string;
  settledAt: string | null;
  settledShiftId: string | null;
  /** 实际结算金额 */
  finalAmount: number | null;
  /** 已补收金额合计 */
  extraCollected: number;
  extraPayments: ExtraPayment[];
  /** 版本链：开泵冻结 v1，结清 v2，每次调整再加一版 */
  versions: AuthVersion[];
}

export interface Handover {
  /** 接班班次 */
  toShiftId: string;
  /** 跨班交接的未结授权 */
  authIds: string[];
  /** 书面处理办法 */
  handling: string;
  at: string;
}

export interface Shift {
  id: string;
  name: string;
  startedAt: string;
  status: "open" | "closed";
  closedAt: string | null;
  handover: Handover | null;
}

export interface StationState {
  cards: FuelCard[];
  authorizations: Authorization[];
  shifts: Shift[];
  meta: {
    schemaVersion: number;
    savedAt: string;
  };
}

export interface Conflict {
  /** 卡号 */
  cardNo: string;
  /** 油枪 */
  nozzle: string;
  /** 差额（元，无金额差异时为 0） */
  difference: number;
  /** 违反的规则 */
  rule: string;
  /** 说明 */
  detail: string;
}
