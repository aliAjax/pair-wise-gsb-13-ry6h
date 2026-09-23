<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { yuan } from "../domain/money";
import { fmtTime } from "../domain/id";
import { useStationStore } from "../store/station";
import SettleBox from "../components/SettleBox.vue";

const store = useStationStore();
const nozzles = ["01", "02", "03", "04", "05", "06", "07", "08"];

interface FormState {
  cardNo: string;
  nozzle: string;
  plate: string;
  frozenAmount: number;
}

function blank(): FormState {
  return { cardNo: "", nozzle: "", plate: "", frozenAmount: 0 };
}

// 被拒绝后输入保留，不清空表单（挂失/余额不足/车牌不符时仍可见原始输入）
const form = reactive<FormState>(blank());
const rejectMsg = ref<string | null>(null);
const successMsg = ref<string | null>(null);

const selectedCard = computed(() => store.cardByNo(form.cardNo));
const previewAvailable = computed(() => (form.cardNo ? store.availableOf(form.cardNo) : null));

function fillPlate() {
  if (selectedCard.value && !form.plate) form.plate = selectedCard.value.holderPlate;
}

function submit() {
  rejectMsg.value = null;
  successMsg.value = null;
  const r = store.openPump({ ...form, frozenAmount: Number(form.frozenAmount) });
  if (!r.ok) {
    // 拒绝：保留全部输入，仅展示规则原因
    rejectMsg.value = r.reason;
    return;
  }
  successMsg.value = `已开泵：${r.data.id}，冻结 ${yuan(r.data.frozenAmount)}`;
  Object.assign(form, blank());
}
</script>

<template>
  <div class="page-grid">
    <form class="panel" @submit.prevent="submit">
      <h2>开泵预授权</h2>
      <p class="hint">开泵前按卡号、油枪、车牌冻结额度；挂失卡 / 余额不足 / 车牌不符一律拒绝。</p>
      <div class="form-grid">
        <label>
          卡号
          <select v-model="form.cardNo" required @change="fillPlate">
            <option value="" disabled>请选择卡片</option>
            <option v-for="c in store.cards" :key="c.cardNo" :value="c.cardNo">
              {{ c.cardNo }}{{ c.status === "lost" ? "（已挂失）" : "" }} ·
              {{ c.holderPlate }}
            </option>
          </select>
        </label>
        <label>
          油枪
          <select v-model="form.nozzle" required>
            <option value="" disabled>请选择油枪</option>
            <option v-for="n in nozzles" :key="n" :value="n">{{ n }} 号枪</option>
          </select>
        </label>
        <label>
          车牌
          <input v-model="form.plate" type="text" placeholder="如 沪A12345" required />
        </label>
        <label>
          冻结额度（元）
          <input v-model.number="form.frozenAmount" type="number" min="0" step="0.01" required />
        </label>

        <div v-if="previewAvailable !== null" class="preview">
          该卡可用余额（卡内余额 − 未结冻结）：<strong>{{ yuan(previewAvailable) }}</strong>
        </div>

        <p v-if="rejectMsg" class="alert error">⛔ 拒绝开泵：{{ rejectMsg }}</p>
        <p v-if="successMsg" class="alert ok">✅ {{ successMsg }}</p>

        <button class="primary" type="submit">校验并冻结开泵</button>
      </div>
    </form>

    <section class="list-panel">
      <div class="toolbar">
        <h2>未结授权（{{ store.openAuths.length }}）</h2>
        <span class="muted">同卡有未结授权不得再次开泵</span>
      </div>

      <div class="record-grid">
        <div v-if="store.openAuths.length === 0" class="empty">当前没有未结授权</div>
        <article v-for="a in store.openAuths" :key="a.id" class="record">
          <div class="record-head">
            <p class="record-title">{{ a.cardNo }} · 油枪 {{ a.nozzle }} · {{ a.plate }}</p>
            <span class="status status-open">冻结中</span>
          </div>
          <div class="details">
            <span>授权号：{{ a.id }}</span>
            <span>冻结额：{{ yuan(a.frozenAmount) }}</span>
            <span>开泵：{{ fmtTime(a.createdAt) }}</span>
            <span>
              归属班次：{{ store.shiftById(a.ownerShiftId)?.name ?? a.ownerShiftId }}
            </span>
          </div>
          <SettleBox :auth="a" />
        </article>
      </div>
    </section>
  </div>
</template>
