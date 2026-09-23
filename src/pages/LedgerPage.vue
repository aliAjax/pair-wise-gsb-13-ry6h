<script setup lang="ts">
import { computed } from "vue";
import { yuan } from "../domain/money";
import { fmtTime } from "../domain/id";
import { useStationStore } from "../store/station";
import AdjustBox from "../components/AdjustBox.vue";
import type { Authorization } from "../domain/types";

const store = useStationStore();
const settled = computed(() =>
  [...store.authorizations]
    .filter((a) => a.status === "settled")
    .sort((a, b) => (b.settledAt ?? "").localeCompare(a.settledAt ?? ""))
);

const actionLabel: Record<string, string> = {
  freeze: "冻结",
  settle: "结清",
  adjust: "调整"
};

function extraCount(a: Authorization): number {
  return a.extraPayments.length;
}
</script>

<template>
  <section class="list-panel wide">
    <div class="toolbar">
      <h2>结清台账（{{ settled.length }}）</h2>
      <span class="muted">结清后冻结释放；调整必须带原因并另存版本</span>
    </div>

    <div class="record-grid">
      <div v-if="settled.length === 0" class="empty">暂无已结清授权</div>
      <article v-for="a in settled" :key="a.id" class="record">
        <div class="record-head">
          <p class="record-title">{{ a.cardNo }} · 油枪 {{ a.nozzle }} · {{ a.plate }}</p>
          <span class="status status-settled">已结清</span>
        </div>
        <div class="details">
          <span>授权号：{{ a.id }}</span>
          <span>结清时间：{{ fmtTime(a.settledAt) }}</span>
          <span>冻结额：{{ yuan(a.frozenAmount) }}</span>
          <span>实际结算：<strong>{{ yuan(a.finalAmount) }}</strong></span>
          <span>
            补收：{{ yuan(a.extraCollected) }}
            <em v-if="extraCount(a) > 0">（{{ extraCount(a) }} 笔）</em>
          </span>
          <span>结全班次：{{ store.shiftById(a.settledShiftId ?? "")?.name ?? "—" }}</span>
        </div>

        <details class="extras" v-if="a.extraPayments.length">
          <summary>补收明细</summary>
          <ul>
            <li v-for="(p, i) in a.extraPayments" :key="i">
              {{ fmtTime(p.at) }} 补收 {{ yuan(p.amount) }}
            </li>
          </ul>
        </details>

        <div class="versions">
          <p class="v-title">版本链（{{ a.versions.length }} 个版本）</p>
          <ol>
            <li v-for="v in a.versions" :key="v.version">
              <span class="v-badge">v{{ v.version }} · {{ actionLabel[v.action] }}</span>
              <span class="v-at">{{ fmtTime(v.at) }}</span>
              <span class="v-reason">{{ v.reason }}</span>
              <span class="v-shift">{{ store.shiftById(v.operatorShiftId)?.name ?? v.operatorShiftId }}</span>
            </li>
          </ol>
        </div>

        <AdjustBox :auth="a" />
      </article>
    </div>
  </section>
</template>

<style scoped>
.extras {
  margin: 6px 0 10px;
  font-size: 13px;
  color: #536078;
}
.extras ul {
  margin: 6px 0;
  padding-left: 18px;
  display: grid;
  gap: 3px;
}
.versions {
  background: #f4f7fb;
  border-radius: 8px;
  padding: 10px 12px;
}
.v-title {
  margin: 0 0 8px;
  font-weight: 700;
  font-size: 13px;
  color: #445069;
}
.versions ol {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 13px;
}
.versions li {
  display: grid;
  grid-template-columns: 92px 110px 1fr auto;
  gap: 8px;
  color: #536078;
}
.v-badge {
  font-weight: 700;
  color: #176b87;
}
.v-reason {
  color: #445069;
}
.v-shift {
  color: #7a869c;
  font-size: 12px;
  white-space: nowrap;
}
em {
  color: #b25b1d;
  font-style: normal;
}
@media (max-width: 860px) {
  .versions li {
    grid-template-columns: 1fr;
  }
}
</style>
