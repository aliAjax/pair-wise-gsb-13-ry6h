/* 纯规则冒烟测试：node --import tsx（此处用 esbuild 直接转译运行，不入 tsconfig） */
import assert from "node:assert";
import { seedState } from "../src/storage/seed";
import { judgeOpenPump } from "../src/rules/openPump";
import { judgeSettle, judgeExtra, requiredExtra } from "../src/rules/settle";
import { judgeAdjust } from "../src/rules/adjust";
import { judgeCloseShift } from "../src/rules/shifts";
import { checkConsistency } from "../src/rules/consistency";

let s = seedState();
let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed++;
  console.log("  ✓", name);
}

// 1. 种子数据重开一致，无冲突
ok("种子数据四者一致", checkConsistency(s).length === 0);

// 2. 同卡(C-1002)有未结授权，不得再次开泵
const busy = judgeOpenPump(
  { cardNo: "C-1002", nozzle: "01", plate: "沪B88888", frozenAmount: 10 },
  s.cards,
  s.authorizations
);
ok("同卡未结拒绝再次开泵", !busy.ok && busy.code === "CARD_BUSY");

// 3. 挂失卡拒绝
const lost = judgeOpenPump(
  { cardNo: "C-1003", nozzle: "01", plate: "京A66666", frozenAmount: 10 },
  s.cards,
  s.authorizations
);
ok("挂失卡拒绝开泵", !lost.ok && lost.code === "CARD_LOST");

// 4. 车牌不符拒绝
const plate = judgeOpenPump(
  { cardNo: "C-1004", nozzle: "01", plate: "沪A99999", frozenAmount: 10 },
  s.cards,
  s.authorizations
);
ok("车牌不符拒绝开泵", !plate.ok && plate.code === "PLATE_MISMATCH");

// 5. 余额不足拒绝（C-1004 余额 1200，冻结 1300 不行）
const poor = judgeOpenPump(
  { cardNo: "C-1004", nozzle: "01", plate: "粤S90909", frozenAmount: 1300 },
  s.cards,
  s.authorizations
);
ok("可用余额不足拒绝", !poor.ok && poor.code === "INSUFFICIENT");

// 6. 油枪互斥：05 被 C-1002 占用
const nozzle = judgeOpenPump(
  { cardNo: "C-1004", nozzle: "05", plate: "粤S90909", frozenAmount: 10 },
  s.cards,
  s.authorizations
);
ok("油枪占用拒绝开泵", !nozzle.ok && nozzle.code === "NOZZLE_BUSY");

// 7. 正常开泵
const good = judgeOpenPump(
  { cardNo: "C-1004", nozzle: "02", plate: "粤s90909", frozenAmount: 500 },
  s.cards,
  s.authorizations
);
ok("车牌归一化后正常开泵", good.ok && good.data.frozenAmount === 500);

// 8. 超预授额必须先补收
const open = s.authorizations.find((a) => a.id === "AUTH-20260923-002")!;
const over = judgeSettle(open, 720);
ok("超预授额不能直接结清", over.ok && over.data.canSettle === false && over.data.need === 120);
const direct = (() => {
  const r = judgeSettle(open, 720);
  return r.ok && !r.data.canSettle;
})();
ok("需补收差额计算正确(600->720 需120)", requiredExtra(open, 720) === 120 && direct);

// 9. 补收不能超额
const tooMuch = judgeExtra(open, 720, 200);
ok("补收超过差额被拒绝", !tooMuch.ok && tooMuch.code === "EXTRA_OVERFLOW");
const part = judgeExtra(open, 720, 100);
ok("部分补收允许", part.ok && part.data.remaining === 20);

// 10. 未写处理办法不得关班
const early = s.shifts[1]; // 中班 open 且挂有未结授权
const noPlan = judgeCloseShift(
  early,
  s.authorizations.filter((a) => a.status === "open"),
  { handling: "", toShiftId: "" }
);
ok("未结授权未写处理办法不得关班", !noPlan.ok && noPlan.code === "HANDLING_REQUIRED");
const planned = judgeCloseShift(
  early,
  s.authorizations.filter((a) => a.status === "open"),
  { handling: "移交晚班跟进", toShiftId: "SHIFT-NEW" }
);
ok("写清办法并指定接班班次可关班", planned.ok && planned.data.handoverRequired);

// 11. 无未结授权可直接关班
s = seedState();
const settled = s.authorizations.find((a) => a.id === "AUTH-20260923-001")!;
const noOpen = judgeCloseShift(
  { ...s.shifts[0], status: "open", handover: null, closedAt: null },
  [],
  { handling: "", toShiftId: "" }
);
ok("无未结授权可直接关班", noOpen.ok && !noOpen.data.handoverRequired);

// 12. 结清后调整必须带原因
const noReason = judgeAdjust(settled, { finalAmount: 460, reason: "  " });
ok("调整无原因拒绝", !noReason.ok && noReason.code === "REASON_REQUIRED");
const adj = judgeAdjust(settled, { finalAmount: 460, reason: "客户退货部分油品" });
ok("带原因调整允许", adj.ok && adj.data.finalAmount === 460);

// 13. 注入篡改后一致性检查报冲突（冻结额被改且未升版本 + 超余额）
s = seedState();
const open2 = s.authorizations.find((a) => a.status === "open")!;
open2.frozenAmount = open2.frozenAmount + 300;
const conflicts = checkConsistency(s);
ok("篡改后检测到冲突", conflicts.length >= 2);
ok(
  "冲突带卡号/油枪/差额/规则",
  conflicts.every(
    (c) => "cardNo" in c && "nozzle" in c && typeof c.difference === "number" && c.rule
  )
);

console.log(`\n全部 ${passed} 项规则冒烟测试通过。`);
