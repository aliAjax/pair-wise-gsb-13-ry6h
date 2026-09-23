<script setup lang="ts">
import { ref, computed } from "vue";
import type { Authorization } from "../domain/types";
import { yuan } from "../domain/money";
import { useStationStore } from "../store/station";

const props = defineProps<{ auth: Authorization }>();
const store = useStationStore();

// 结算输入与补收过程中页面输入一律保留，拒绝/成功都不清空
const finalAmount = ref<number>(props.auth.frozenAmount);
const extraPay = ref<number>(0);
const message = ref<{ type: "error" | "ok"; text: string } | null>(null);

const remaining = computed(() => store.requiredExtraOf(props.auth, Number(finalAmount) || 0));
const extraNeeded = computed(() => remaining.value > 0);

function doExtra() {
  message.value = null;
  const r = store.collectExtra(props.auth, Number(finalAmount), Number(extraPay));
  if (!r.ok) {
    message.value = { type: "error", text: r.reason };
  } else {
    message.value = {
      type: "ok",
      text:
        r.data > 0
          ? `补收成功，还差 ${yuan(r.data)} 才能结清`
          : "补收已齐，可以结清"
    };
    extraPay.value = 0;
  }
}

function doSettle() {
  message.value = null;
  const r = store.settle(props.auth, Number(finalAmount));
  if (!r.ok) {
    message.value = { type: "error", text: r.reason };
  }
}
</script>

<template>
  <div class="settle-box">
    <div class="row">
      <label>
        实际结算金额（元）
        <input v-model.number="finalAmount" type="number" min="0" step="0.01" />
      </label>
      <div class="gap">
        <p>冻结 {{ yuan(auth.frozenAmount) }} · 已补收 {{ yuan(auth.extraCollected) }}</p>
        <p v-if="extraNeeded" class="warn">
          超出预授额 {{ yuan(remaining) }}：必须先补收，否则不能结清
        </p>
        <p v-else class="ok">补收已齐 / 未超预授额，可直接结清</p>
      </div>
    </div>

    <div v-if="extraNeeded" class="row">
      <label>
        本次补收金额（元）
        <input v-model.number="extraPay" type="number" min="0" step="0.01" />
      </label>
      <button type="button" @click="doExtra">补收</button>
    </div>

    <div class="row">
      <button type="button" :disabled="extraNeeded" class="primary" @click="doSettle">
        结清并释放冻结
      </button>
    </div>

    <p v-if="message" :class="['msg', message.type]">{{ message.text }}</p>
  </div>
</template>

<style scoped>
.settle-box {
  border-top: 1px dashed #d4deea;
  margin-top: 10px;
  padding-top: 12px;
  display: grid;
  gap: 10px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
}
label {
  display: grid;
  gap: 5px;
  font-size: 13px;
  color: #445069;
  flex: 1;
  min-width: 180px;
}
.gap {
  font-size: 13px;
  color: #536078;
  padding-bottom: 6px;
}
.gap p {
  margin: 2px 0;
}
.warn {
  color: #b25b1d;
  font-weight: 700;
}
.ok {
  color: #14724f;
  font-weight: 700;
}
button {
  white-space: nowrap;
}
.msg {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
}
.msg.error {
  background: #fdecea;
  color: #9c3520;
}
.msg.ok {
  background: #e8f4ef;
  color: #14724f;
}
</style>
