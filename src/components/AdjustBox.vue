<script setup lang="ts">
import { ref } from "vue";
import type { Authorization } from "../domain/types";
import { yuan } from "../domain/money";
import { useStationStore } from "../store/station";

const props = defineProps<{ auth: Authorization }>();
const store = useStationStore();

const open = ref(false);
const finalAmount = ref<number>(props.auth.finalAmount ?? 0);
const reason = ref("");
const message = ref<{ type: "error" | "ok"; text: string } | null>(null);

function submit() {
  message.value = null;
  const r = store.adjustSettled(props.auth, Number(finalAmount), reason);
  if (!r.ok) {
    message.value = { type: "error", text: r.reason };
  } else {
    message.value = { type: "ok", text: "已按原因另存新版本并调整卡余额" };
    reason.value = "";
    open.value = false;
  }
}
</script>

<template>
  <div class="adjust">
    <button type="button" class="secondary small" @click="open = !open">
      {{ open ? "收起调整" : "调整金额（带原因另存版本）" }}
    </button>
    <div v-if="open" class="form">
      <label>
        调整后结算金额（元，冻结额不可改）
        <input v-model.number="finalAmount" type="number" min="0" step="0.01" />
      </label>
      <label>
        调整原因（必填）
        <textarea v-model="reason" placeholder="如：加油后客户退货部分油品，经站长批准冲减" />
      </label>
      <button type="button" class="primary" @click="submit">确认调整并存为新版本</button>
      <p v-if="message" :class="['msg', message.type]">{{ message.text }}</p>
      <p class="tip">
        当前结清 {{ yuan(auth.finalAmount) }}，冻结 {{ yuan(auth.frozenAmount) }}，
        已补收 {{ yuan(auth.extraCollected) }}；调减不得低于冻结+补收。
      </p>
    </div>
  </div>
</template>

<style scoped>
.adjust {
  margin-top: 10px;
}
.form {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  border-top: 1px dashed #d4deea;
  padding-top: 12px;
}
label {
  display: grid;
  gap: 5px;
  font-size: 13px;
  color: #445069;
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
.tip {
  margin: 0;
  font-size: 12px;
  color: #7a869c;
}
.small {
  padding: 7px 10px;
  font-size: 13px;
}
</style>
