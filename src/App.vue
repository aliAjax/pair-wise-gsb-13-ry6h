<script setup lang="ts">
import { computed, ref } from "vue";
import { yuan } from "./domain/money";
import { useStationStore } from "./store/station";
import ConflictBanner from "./components/ConflictBanner.vue";
import AuthorizePage from "./pages/AuthorizePage.vue";
import LedgerPage from "./pages/LedgerPage.vue";
import ShiftsPage from "./pages/ShiftsPage.vue";
import CardsPage from "./pages/CardsPage.vue";
import DiagnosticsPage from "./pages/DiagnosticsPage.vue";

const store = useStationStore();
const tab = ref("authorize");

const tabs = [
  { key: "authorize", label: "开泵预授权" },
  { key: "ledger", label: "结清台账" },
  { key: "shifts", label: "班次交接" },
  { key: "cards", label: "卡片资料" },
  { key: "diagnostics", label: "数据与自检" }
];

const frozenTotal = computed(() =>
  store.openAuths.reduce((s, a) => s + a.frozenAmount, 0)
);
const settledTotal = computed(() =>
  store.authorizations
    .filter((a) => a.status === "settled")
    .reduce((s, a) => s + (a.finalAmount ?? 0), 0)
);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">加油站 · 补油卡预授权 / 班次交接</p>
          <h1>预授权冻结与跨班交接系统</h1>
          <p class="subtitle">
            开泵按卡号、油枪、车牌冻结额度；同卡未结唯一，挂失 / 余额不足 / 车牌不符拒绝并保留输入；
            超预授额先补收后结清；未结授权跨班写处理办法再关班；结清后调整带原因另存版本；重开四者一致核对。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue 3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">分层：资料/判定/存储/页面</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>在班班次</span>
          <strong>{{ store.currentShift?.name ?? "无（请开班）" }}</strong>
        </article>
        <article class="metric">
          <span>未结授权 / 冻结总额</span>
          <strong>{{ store.openAuths.length }} 笔 · {{ yuan(frozenTotal) }}</strong>
        </article>
        <article class="metric">
          <span>已结清 / 结算总额</span>
          <strong>{{ store.authorizations.filter((a) => a.status === "settled").length }} 笔 ·
            {{ yuan(settledTotal) }}</strong>
        </article>
      </section>

      <ConflictBanner :compact="tab !== 'diagnostics'" @goto="tab = $event" />

      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          :class="['tab', { active: tab === t.key }]"
          @click="tab = t.key"
        >
          {{ t.label }}
          <i v-if="t.key === 'diagnostics' && store.conflicts.length" class="dot">
            {{ store.conflicts.length }}
          </i>
        </button>
      </nav>

      <AuthorizePage v-if="tab === 'authorize'" />
      <LedgerPage v-else-if="tab === 'ledger'" />
      <ShiftsPage v-else-if="tab === 'shifts'" />
      <CardsPage v-else-if="tab === 'cards'" />
      <DiagnosticsPage v-else-if="tab === 'diagnostics'" />

      <footer class="footer">数据持久化于 localStorage · 最近保存 {{ store.savedAt }}</footer>
    </div>
  </main>
</template>
