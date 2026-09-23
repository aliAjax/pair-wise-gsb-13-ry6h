// 授权资料 + 初始业务数据（首次进入时的种子数据）
import type { AuthVersionRecord, Database, PreAuth } from "./types";

const T0 = "2026-09-23T06:00:00+08:00";
const T1 = "2026-09-23T07:10:00+08:00";
const T2 = "2026-09-23T08:20:00+08:00";
const T3 = "2026-09-23T09:05:00+08:00";
const T4 = "2026-09-23T09:40:00+08:00";
const TC = "2026-09-23T14:02:00+08:00";

/** 初始版本记录：与各授权单当前快照保持一致 */
const seedVersions: AuthVersionRecord[] = [
  {
    authId: "A-1001",
    version: 1,
    reason: "开泵冻结",
    at: T1,
    operator: "王芳",
    snapshot: { amount: 500, pumpNo: "1", plate: "京A12345", status: "settled" }
  },
  {
    authId: "A-1001",
    version: 2,
    reason: "按实际加油量调整冻结额度",
    at: T2,
    operator: "王芳",
    snapshot: { amount: 420, pumpNo: "1", plate: "京A12345", status: "settled" }
  },
  {
    authId: "A-1002",
    version: 1,
    reason: "开泵冻结",
    at: T3,
    operator: "王芳",
    snapshot: { amount: 600, pumpNo: "2", plate: "沪B88888", status: "frozen" }
  },
  {
    authId: "A-1003",
    version: 1,
    reason: "开泵冻结",
    at: T4,
    operator: "王芳",
    snapshot: { amount: 300, pumpNo: "3", plate: "粤C36915", status: "frozen" }
  },
  {
    authId: "A-1004",
    version: 1,
    reason: "开泵冻结",
    at: T0,
    operator: "李强",
    snapshot: { amount: 450, pumpNo: "1", plate: "京A12345", status: "frozen" }
  }
];

const seedAuths: PreAuth[] = [
  {
    id: "A-1001",
    cardNo: "1001",
    pumpNo: "1",
    plate: "京A12345",
    amount: 420,
    status: "settled",
    createdAt: T1,
    createdShiftId: "S-0923-1",
    ownerShiftId: "S-0923-1",
    handoverTrail: [],
    settlement: {
      finalAmount: 500,
      authAmount: 420,
      extraCollected: 80,
      cardCharged: 420,
      at: T2,
      shiftId: "S-0923-1",
      operator: "王芳"
    }
  },
  {
    id: "A-1002",
    cardNo: "1002",
    pumpNo: "2",
    plate: "沪B88888",
    amount: 600,
    status: "frozen",
    createdAt: T3,
    createdShiftId: "S-0923-1",
    ownerShiftId: "S-0923-1",
    handoverTrail: []
  },
  {
    id: "A-1003",
    cardNo: "1003",
    pumpNo: "3",
    plate: "粤C36915",
    amount: 300,
    status: "frozen",
    createdAt: T4,
    createdShiftId: "S-0923-1",
    ownerShiftId: "S-0923-1",
    handoverTrail: []
  },
  {
    // 夜班跨班挂账，已被早班接手，未结
    id: "A-1004",
    cardNo: "1001",
    pumpNo: "1",
    plate: "京A12345",
    amount: 450,
    status: "frozen",
    createdAt: T0,
    createdShiftId: "S-0922-3",
    ownerShiftId: "S-0923-1",
    handoverTrail: [
      {
        shiftId: "S-0922-3",
        shiftName: "晚班 2026-09-22",
        note: "车主为物流公司夜间加油，预计 09-23 上午结算，跟车员已电话确认。",
        at: TC
      }
    ]
  }
];

export function seedDatabase(): Database {
  return {
    cards: [
      { cardNo: "1001", holder: "北京顺达物流", plate: "京A12345", balance: 1130, status: "normal" },
      { cardNo: "1002", holder: "张伟（个人）", plate: "沪B88888", balance: 1400, status: "normal" },
      { cardNo: "1003", holder: "广州速运", plate: "粤C36915", balance: 320, status: "normal" },
      { cardNo: "1004", holder: "陈明（个人）", plate: "川D00168", balance: 900, status: "lost" }
    ],
    pumps: [
      { no: "1", fuel: "92# 汽油" },
      { no: "2", fuel: "95# 汽油" },
      { no: "3", fuel: "0# 柴油" },
      { no: "4", fuel: "98# 汽油" }
    ],
    shifts: [
      { id: "S-0922-3", name: "晚班 2026-09-22", openedAt: "2026-09-22T22:00:00+08:00", closedAt: TC, status: "closed" },
      { id: "S-0923-1", name: "早班 2026-09-23", openedAt: "2026-09-23T06:00:00+08:00", status: "open" }
    ],
    auths: seedAuths,
    versions: seedVersions
  };
}
