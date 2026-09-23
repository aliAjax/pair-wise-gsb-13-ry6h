import type { Authorization, FuelCard, Shift, StationState } from "../domain/types";

const T1 = "2026-09-23T07:05";
const T2 = "2026-09-23T08:40";
const T3 = "2026-09-23T10:20";
const T_START_EARLY = "2026-09-23T07:00";
const T_START_MID = "2026-09-23T15:00";

const cards: FuelCard[] = [
  { cardNo: "C-1001", holderPlate: "沪A12345", balance: 3000, status: "normal", note: "公司车队主卡" },
  { cardNo: "C-1002", holderPlate: "沪B88888", balance: 800, status: "normal", note: "" },
  { cardNo: "C-1003", holderPlate: "京A66666", balance: 500, status: "lost", note: "客户已电话挂失" },
  { cardNo: "C-1004", holderPlate: "粤S90909", balance: 1200, status: "normal", note: "" }
];

const authSettled: Authorization = {
  id: "AUTH-20260923-001",
  cardNo: "C-1001",
  nozzle: "03",
  plate: "沪A12345",
  frozenAmount: 500,
  status: "settled",
  openedShiftId: "SHIFT-0923-EARLY",
  ownerShiftId: "SHIFT-0923-EARLY",
  createdAt: T1,
  settledAt: T2,
  settledShiftId: "SHIFT-0923-EARLY",
  finalAmount: 480,
  extraCollected: 0,
  extraPayments: [],
  versions: [
    {
      version: 1,
      action: "freeze",
      reason: "开泵预授权冻结",
      at: T1,
      operatorShiftId: "SHIFT-0923-EARLY",
      snapshot: {
        status: "open",
        plate: "沪A12345",
        nozzle: "03",
        frozenAmount: 500,
        finalAmount: null,
        extraCollected: 0
      }
    },
    {
      version: 2,
      action: "settle",
      reason: "实际 480 元，未超预授额，直接结清并释放冻结",
      at: T2,
      operatorShiftId: "SHIFT-0923-EARLY",
      snapshot: {
        status: "settled",
        plate: "沪A12345",
        nozzle: "03",
        frozenAmount: 500,
        finalAmount: 480,
        extraCollected: 0
      }
    }
  ]
};

const authOpen: Authorization = {
  id: "AUTH-20260923-002",
  cardNo: "C-1002",
  nozzle: "05",
  plate: "沪B88888",
  frozenAmount: 600,
  status: "open",
  openedShiftId: "SHIFT-0923-EARLY",
  ownerShiftId: "SHIFT-0923-MID",
  createdAt: T3,
  settledAt: null,
  settledShiftId: null,
  finalAmount: null,
  extraCollected: 0,
  extraPayments: [],
  versions: [
    {
      version: 1,
      action: "freeze",
      reason: "开泵预授权冻结",
      at: T3,
      operatorShiftId: "SHIFT-0923-EARLY",
      snapshot: {
        status: "open",
        plate: "沪B88888",
        nozzle: "05",
        frozenAmount: 600,
        finalAmount: null,
        extraCollected: 0
      }
    }
  ]
};

const shifts: Shift[] = [
  {
    id: "SHIFT-0923-EARLY",
    name: "2026-09-23 早班",
    startedAt: T_START_EARLY,
    status: "closed",
    closedAt: "2026-09-23T15:00",
    handover: {
      toShiftId: "SHIFT-0923-MID",
      authIds: ["AUTH-20260923-002"],
      handling: "客户加油未结束跨班，C-1002 油枪05 的 600 元冻结授权移交中班跟进结算，禁止重复开泵。",
      at: "2026-09-23T15:00"
    }
  },
  {
    id: "SHIFT-0923-MID",
    name: "2026-09-23 中班",
    startedAt: T_START_MID,
    status: "open",
    closedAt: null,
    handover: null
  }
];

export function seedState(): StationState {
  return {
    cards: structuredClone(cards),
    authorizations: [structuredClone(authSettled), structuredClone(authOpen)],
    shifts: structuredClone(shifts),
    meta: { schemaVersion: 1, savedAt: new Date().toISOString() }
  };
}
