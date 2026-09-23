<script setup lang="ts">
import { ref } from "vue";
import { yuan } from "../domain/money";
import { useStationStore } from "../store/station";

const store = useStationStore();
const reloadedAt = ref<string | null>(null);

function reload() {
  store.reload();
  reloadedAt.value = new Date().toISOString().replace("T", " ").slice(0, 19);
}
</script>

<template>
  <section class="list-panel wide">
    <div class="toolbar">
      <h2>数据与自检</h2>
      <span class="muted">模拟关站重开：重新读取持久化数据并核对卡片、授权、班次、版本一致性</span>
    </div>

    <div class="diag-actions">
      <button type="button" class="primary" @click="reload">模拟重开（重新载入并核对）</button>
      <button type="button" class="secondary" @click="store.injectConflict">
        注入异常（演示冲突显示）
      </button>
      <button type="button" class="danger" @click="store.resetAll">恢复演示数据</button>
      <span v-if="reloadedAt" class="muted">最近重开：{{ reloadedAt }}</span>
    </div>

    <div :class="['result-box', store.conflicts.length ? 'bad' : 'good']">
      <p class="result-title">
        {{ store.conflicts.length === 0 ? "✅ 四者一致，无冲突" : `⛔ 发现 ${store.conflicts.length} 处冲突` }}
      </p>
      <p v-if="store.conflicts.length === 0" class="muted">
        卡片、授权、班次、版本链在重开后完全一致。
      </p>

      <table v-if="store.conflicts.length" class="conflict-table">
        <thead>
          <tr>
            <th>卡号</th>
            <th>油枪</th>
            <th>差额</th>
            <th>违反规则</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in store.conflicts" :key="i">
            <td>{{ c.cardNo || "—" }}</td>
            <td>{{ c.nozzle || "—" }}</td>
            <td :class="{ neg: c.difference !== 0 }">{{ yuan(c.difference) }}</td>
            <td class="rule">{{ c.rule }}</td>
            <td>{{ c.detail }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <details class="raw">
      <summary>查看当前持久化数据（StationState JSON）</summary>
      <pre>{{ JSON.stringify(store.state, null, 2) }}</pre>
    </details>
  </section>
</template>

<style scoped>
.diag-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 16px;
}
.result-box {
  border-radius: 8px;
  padding: 14px 16px;
}
.result-box.good {
  background: #e8f4ef;
  border: 1px solid #bfe0d0;
}
.result-box.bad {
  background: #fdecea;
  border: 1px solid #f0c4bd;
}
.result-title {
  margin: 0 0 6px;
  font-weight: 700;
}
.conflict-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 13px;
  background: #fff;
  border-radius: 6px;
  overflow: hidden;
}
.conflict-table th,
.conflict-table td {
  border: 1px solid #ead7d4;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.conflict-table th {
  background: #f6e3e0;
  color: #7a2a1c;
}
.conflict-table .rule {
  color: #9c3520;
  font-weight: 700;
  white-space: nowrap;
}
.neg {
  color: #c84b31;
  font-weight: 700;
}
.raw {
  margin-top: 16px;
}
.raw pre {
  max-height: 360px;
  overflow: auto;
  background: #172033;
  color: #d6e2f0;
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
}
</style>
