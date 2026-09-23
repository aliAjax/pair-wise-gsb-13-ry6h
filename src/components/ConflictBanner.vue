<script setup lang="ts">
import { useStationStore } from "../store/station";
import { yuan } from "../domain/money";

defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ goto: [tab: string] }>();
const store = useStationStore();
</script>

<template>
  <div v-if="store.conflicts.length" class="conflict-banner" @click="emit('goto', 'diagnostics')">
    <strong>⚠ 重开一致性检查发现 {{ store.conflicts.length }} 处冲突</strong>
    <ul v-if="!compact">
      <li v-for="(c, i) in store.conflicts.slice(0, 4)" :key="i">
        <span class="cf-card">{{ c.cardNo || "—" }}</span>
        <span class="cf-nozzle">油枪 {{ c.nozzle || "—" }}</span>
        <span class="cf-diff">差额 {{ yuan(c.difference) }}</span>
        <span class="cf-rule">{{ c.rule }}</span>
      </li>
      <li v-if="store.conflicts.length > 4">……点击查看全部</li>
    </ul>
    <span class="cf-hint">点击进入数据与自检页面 →</span>
  </div>
</template>

<style scoped>
.conflict-banner {
  background: #fff1f0;
  border: 1px solid #f5b5ad;
  border-left: 5px solid #c84b31;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  cursor: pointer;
  color: #7a2a1c;
}
.conflict-banner ul {
  margin: 8px 0 4px;
  padding-left: 18px;
  font-size: 13px;
  display: grid;
  gap: 4px;
}
.cf-card,
.cf-nozzle,
.cf-diff {
  font-weight: 700;
  margin-right: 10px;
}
.cf-rule {
  color: #9c3520;
}
.cf-hint {
  font-size: 12px;
  color: #a35342;
}
</style>
