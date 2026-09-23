<script setup lang="ts">
// 页面：授权列表、结算补收、调整另存版本、版本回溯
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useStationStore } from "../stores/station";
import type { PreAuth } from "../domain/types";
import { cny, dt } from "../domain/money";

const store = useStationStore();
const filter = ref<"all" | "frozen" | "settled">("all");

const rows = computed(() => {
  const list = filter.value === "all" ? store.auths : store.auths.filter((a) => a.status === filter.value);
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

// ---- 结算弹窗 ----
const settleVisible = ref(false);
const settleTarget = ref<PreAuth | null>(null);
const settleForm = reactive({ finalAmount: 0, extraPaid: 0 });
const settleExtraNeeded = computed(() =>
  settleTarget.value ? Math.max(0, Math.round((settleForm.finalAmount - settleTarget.value.amount) * 100) / 100) : 0
);

function openSettle(auth: PreAuth) {
  settleTarget.value = auth;
  settleForm.finalAmount = auth.amount;
  settleForm.extraPaid = 0;
  settleVisible.value = true;
}

function confirmSettle() {
  if (!settleTarget.value) return;
  const res = store.settle(settleTarget.value.id, settleForm.finalAmount, settleForm.extraPaid);
  if (res.ok) {
    ElMessage.success("已结清，授权单冻结");
    settleVisible.value = false;
    settleTarget.value = null;
  } else {
    ElMessage.error(res.message ?? "结算失败");
  }
}

// ---- 调整弹窗 ----
const adjustVisible = ref(false);
const adjustTarget = ref<PreAuth | null>(null);
const adjustForm = reactive({ amount: 0, pumpNo: "", plate: "", reason: "" });

function openAdjust(auth: PreAuth) {
  adjustTarget.value = auth;
  adjustForm.amount = auth.amount;
  adjustForm.pumpNo = auth.pumpNo;
  adjustForm.plate = auth.plate;
  adjustForm.reason = "";
  adjustVisible.value = true;
}

function confirmAdjust() {
  if (!adjustTarget.value) return;
  const res = store.adjust(adjustTarget.value.id, { ...adjustForm });
  if (res.ok) {
    ElMessage.success("已按调整内容另存新版本");
    adjustVisible.value = false;
    adjustTarget.value = null;
  } else {
    ElMessage.error(res.message ?? "调整失败");
  }
}

// ---- 版本抽屉 ----
const versionVisible = ref(false);
const versionTarget = ref<PreAuth | null>(null);
const versionRows = computed(() => (versionTarget.value ? store.versionsOf(versionTarget.value.id) : []));

function openVersions(auth: PreAuth) {
  versionTarget.value = auth;
  versionVisible.value = true;
}

function shiftName(id: string | null): string {
  if (!id) return "跨班挂账窗口";
  return store.shifts.find((s) => s.id === id)?.name ?? id;
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-head">
        <span>预授权单</span>
        <el-radio-group v-model="filter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="frozen">未结</el-radio-button>
          <el-radio-button value="settled">已结清（冻结）</el-radio-button>
        </el-radio-group>
      </div>
    </template>

    <el-table :data="rows" stripe size="small">
      <el-table-column prop="id" label="授权号" width="92" />
      <el-table-column prop="cardNo" label="卡号" width="74" />
      <el-table-column label="油枪" width="64">
        <template #default="{ row }">枪{{ row.pumpNo }}</template>
      </el-table-column>
      <el-table-column prop="plate" label="车牌" width="96" />
      <el-table-column label="预授权" width="92">
        <template #default="{ row }">{{ cny(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'frozen'" type="warning" size="small">未结·冻结中</el-tag>
          <el-tag v-else type="info" size="small">已结清·已冻结</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="归属班" min-width="140">
        <template #default="{ row }">{{ shiftName(row.ownerShiftId) }}</template>
      </el-table-column>
      <el-table-column label="交接/结算" min-width="220">
        <template #default="{ row }">
          <div v-if="row.settlement" class="cell-stack">
            <span>结算 {{ cny(row.settlement.finalAmount) }}（卡扣 {{ cny(row.settlement.cardCharged) }}<template v-if="row.settlement.extraCollected > 0"> ＋补收 {{ cny(row.settlement.extraCollected) }}</template>）</span>
            <span class="muted">{{ dt(row.settlement.at) }} · {{ row.settlement.operator }}</span>
          </div>
          <div v-else-if="row.handoverTrail.length" class="cell-stack">
            <el-tag v-for="(h, i) in row.handoverTrail" :key="i" type="danger" size="small" class="handover-tag">
              跨班：{{ h.shiftName }}
            </el-tag>
            <span class="muted">最近处理办法：{{ row.handoverTrail[row.handoverTrail.length - 1].note }}</span>
          </div>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'frozen'" type="primary" size="small" @click="openSettle(row)">结算</el-button>
          <el-button v-if="row.status === 'frozen'" size="small" @click="openAdjust(row)">调整</el-button>
          <el-button size="small" @click="openVersions(row)">版本</el-button>
        </template>
      </el-table-column>
      <template #empty>暂无授权记录</template>
    </el-table>
  </el-card>

  <!-- 结算：超预授额必须补收 -->
  <el-dialog v-model="settleVisible" title="结算预授权（结清后冻结）" width="460px">
    <div v-if="settleTarget" class="dialog-stack">
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="授权号">{{ settleTarget.id }}</el-descriptions-item>
        <el-descriptions-item label="卡号 / 油枪 / 车牌">
          {{ settleTarget.cardNo }} / 枪{{ settleTarget.pumpNo }} / {{ settleTarget.plate }}
        </el-descriptions-item>
        <el-descriptions-item label="预授权冻结额">{{ cny(settleTarget.amount) }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-position="top">
        <el-form-item label="实际结算额（元）" required>
          <el-input-number v-model="settleForm.finalAmount" :min="0.01" :precision="2" :step="20" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-alert
          v-if="settleExtraNeeded > 0"
          type="warning"
          show-icon
          :closable="false"
          :title="`超出预授权 ¥${settleExtraNeeded.toFixed(2)}，必须补收后才能结清`"
        />
        <el-form-item v-if="settleExtraNeeded > 0" :label="`已补收金额（元，至少 ¥${settleExtraNeeded.toFixed(2)}）`" required>
          <el-input-number v-model="settleForm.extraPaid" :min="0" :precision="2" :step="10" controls-position="right" style="width: 100%" />
        </el-form-item>
        <p class="muted">卡内实扣 {{ cny(Math.min(settleTarget.amount, settleForm.finalAmount)) }}，超额部分走卡外补收。</p>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="settleVisible = false">取消</el-button>
      <el-button type="primary" @click="confirmSettle">补收并结清</el-button>
    </template>
  </el-dialog>

  <!-- 调整：必填原因，另存版本 -->
  <el-dialog v-model="adjustVisible" title="调整授权（带原因另存版本）" width="460px">
    <div v-if="adjustTarget" class="dialog-stack">
      <el-form label-position="top">
        <el-form-item label="冻结额度（元）" required>
          <el-input-number v-model="adjustForm.amount" :min="1" :precision="2" :step="50" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="油枪" required>
          <el-select v-model="adjustForm.pumpNo" style="width: 100%">
            <el-option v-for="pump in store.pumps" :key="pump.no" :value="pump.no" :label="store.pumpLabel(pump.no)" />
          </el-select>
        </el-form-item>
        <el-form-item label="车牌" required>
          <el-input v-model="adjustForm.plate" />
        </el-form-item>
        <el-form-item label="调整原因（必填，将写入版本记录）" required>
          <el-input v-model="adjustForm.reason" type="textarea" :rows="3" placeholder="如：客户改加 95#，按预计金额调整冻结额度" />
        </el-form-item>
      </el-form>
      <p class="muted">调整不覆盖历史：现行授权保持不变，确认后生成新版本快照。</p>
    </div>
    <template #footer>
      <el-button @click="adjustVisible = false">取消</el-button>
      <el-button type="primary" @click="confirmAdjust">另存版本</el-button>
    </template>
  </el-dialog>

  <!-- 版本 -->
  <el-drawer v-model="versionVisible" :title="versionTarget ? `版本记录 · ${versionTarget.id}` : '版本记录'" size="520px">
    <el-timeline v-if="versionRows.length">
      <el-timeline-item v-for="v in versionRows" :key="v.version" :timestamp="dt(v.at)" placement="top" :type="v.version === versionRows[0].version ? 'primary' : 'info'">
        <el-card shadow="never" size="small">
          <p class="version-title">v{{ v.version }} · {{ v.reason }}</p>
          <p class="muted">操作人：{{ v.operator }}</p>
          <p>
            额度 {{ cny(v.snapshot.amount) }} ｜ 枪{{ v.snapshot.pumpNo }} ｜ {{ v.snapshot.plate }} ｜
            <el-tag size="small" :type="v.snapshot.status === 'settled' ? 'info' : 'warning'">
              {{ v.snapshot.status === "settled" ? "已结清" : "冻结中" }}
            </el-tag>
          </p>
        </el-card>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else description="暂无版本" />
  </el-drawer>
</template>
