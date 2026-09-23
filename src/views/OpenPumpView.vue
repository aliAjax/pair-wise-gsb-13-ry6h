<script setup lang="ts">
// 页面：开泵预授权（卡号 / 油枪 / 车牌 / 冻结额度）
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useStationStore } from "../stores/station";
import { availableBalance, frozenAmountForCard, RULES } from "../rules";
import { cny, dt } from "../domain/money";

const store = useStationStore();

// 拒绝时保留输入：表单数据只在开泵成功后清空
const form = reactive({
  cardNo: "",
  pumpNo: "",
  plate: "",
  amount: 500
});
const lastRejection = ref<{ message: string; at: string } | null>(null);

const selectedCard = computed(() => store.cards.find((c) => c.cardNo === form.cardNo.trim()));
const pending = computed(() =>
  store.auths
    .filter((a) => a.status === "frozen")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
);

function submit() {
  const res = store.openAuth({ ...form });
  if (res.ok) {
    lastRejection.value = null;
    ElMessage.success("预授权已冻结，可以开泵加油");
    form.cardNo = "";
    form.pumpNo = "";
    form.plate = "";
    form.amount = 500;
  } else {
    // 拒绝：保留用户输入，仅展示原因
    lastRejection.value = { message: res.message ?? "开泵被拒绝", at: new Date().toISOString() };
    ElMessage.error(res.message ?? "开泵被拒绝");
  }
}
</script>

<template>
  <div class="page-grid">
    <el-card class="form-card" shadow="never">
      <template #header>
        <div class="card-head">
          <span>开泵预授权</span>
          <el-tag v-if="store.currentShift" type="success" size="small">{{ store.currentShift.name }} 进行中</el-tag>
          <el-tag v-else type="danger" size="small">无开班</el-tag>
        </div>
      </template>

      <el-alert
        v-if="lastRejection"
        class="reject-alert"
        type="error"
        :closable="false"
        show-icon
        title="开泵被拒绝，输入已保留"
        :description="`${lastRejection.message}（${dt(lastRejection.at)}）`"
      />

      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="卡号" required>
          <el-select v-model="form.cardNo" placeholder="选择加油卡" filterable style="width: 100%">
            <el-option
              v-for="card in store.cards"
              :key="card.cardNo"
              :value="card.cardNo"
              :label="`${card.cardNo} · ${card.holder}`"
            >
              <div class="card-option">
                <span>{{ card.cardNo }} · {{ card.holder }}</span>
                <span class="muted">
                  绑定 {{ card.plate }} ·
                  <el-tag v-if="card.status === 'lost'" type="danger" size="small">已挂失</el-tag>
                  <el-tag v-else type="info" size="small">可用 {{ cny(availableBalance(store.db, card)) }}</el-tag>
                </span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="油枪" required>
          <el-select v-model="form.pumpNo" placeholder="选择油枪" style="width: 100%">
            <el-option v-for="pump in store.pumps" :key="pump.no" :value="pump.no" :label="store.pumpLabel(pump.no)" />
          </el-select>
        </el-form-item>

        <el-form-item label="车牌（必须与卡片绑定车牌一致）" required>
          <el-input v-model="form.plate" placeholder="如 京A12345" clearable />
        </el-form-item>

        <el-form-item label="冻结额度（元）" required>
          <el-input-number v-model="form.amount" :min="1" :max="50000" :step="50" controls-position="right" style="width: 100%" />
        </el-form-item>

        <el-button type="primary" class="full" native-type="submit" :disabled="!store.currentShift">
          校验并冻结开泵
        </el-button>
        <p v-if="!store.currentShift" class="hint danger-text">当前无开班，请先到「班次交接」开班。</p>
      </el-form>

      <el-divider content-position="left">校验规则</el-divider>
      <ul class="rule-list">
        <li>{{ RULES.CARD_LOST }}</li>
        <li>{{ RULES.PLATE_MISMATCH }}</li>
        <li>{{ RULES.OPEN_AUTH_EXISTS }}</li>
        <li>{{ RULES.PUMP_BUSY }}</li>
        <li>{{ RULES.INSUFFICIENT_BALANCE }}</li>
      </ul>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span>未结授权（冻结中）</span>
          <el-tag>{{ pending.length }} 条</el-tag>
        </div>
      </template>
      <el-table :data="pending" size="small" stripe>
        <el-table-column prop="cardNo" label="卡号" width="80" />
        <el-table-column label="油枪" width="70">
          <template #default="{ row }">枪{{ row.pumpNo }}</template>
        </el-table-column>
        <el-table-column prop="plate" label="车牌" width="100" />
        <el-table-column label="冻结额" width="90">
          <template #default="{ row }">{{ cny(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="当班" min-width="130">
          <template #default="{ row }">{{ store.shifts.find((s) => s.id === row.ownerShiftId)?.name ?? "跨班挂账" }}</template>
        </el-table-column>
        <el-table-column label="开泵时间" min-width="160">
          <template #default="{ row }">{{ dt(row.createdAt) }}</template>
        </el-table-column>
        <template #empty>暂无未结授权，全部油枪空闲</template>
      </el-table>

      <el-divider />
      <div v-if="selectedCard" class="balance-box">
        <p>卡号 {{ selectedCard.cardNo }} · 绑定车牌 {{ selectedCard.plate }}</p>
        <p>
          账户余额 {{ cny(selectedCard.balance) }} ｜
          未结冻结 {{ cny(frozenAmountForCard(store.db, selectedCard.cardNo)) }} ｜
          可用 {{ cny(availableBalance(store.db, selectedCard)) }}
        </p>
      </div>
    </el-card>
  </div>
</template>
