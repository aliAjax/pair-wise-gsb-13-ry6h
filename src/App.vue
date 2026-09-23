<script setup lang="ts">
// 页面装配：授权资料 / 判定 / 存储 均不在页面内实现，仅做视图切换
import { computed, ref } from "vue";
import { useStationStore } from "./stores/station";
import OpenPumpView from "./views/OpenPumpView.vue";
import AuthListView from "./views/AuthListView.vue";
import ShiftView from "./views/ShiftView.vue";
import CardsView from "./views/CardsView.vue";
import ConsistencyView from "./views/ConsistencyView.vue";

const store = useStationStore();
const active = ref("pump");

const conflictBadge = computed(() =>
  store.conflicts.length > 0 ? String(store.conflicts.length) : undefined
);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 预授权与跨班交接</p>
          <h1>加油站班次交接 · 加油卡预授权</h1>
          <p class="subtitle">
            开泵按卡号、油枪、车牌冻结额度；同卡未结不得再开；超额补收后结清；未结授权写处理办法方可关班。
          </p>
        </div>
        <div class="head-side">
          <el-input v-model="store.operator" @change="store.setOperator(store.operator)" placeholder="当班收银员" class="operator-input" />
          <el-tag :type="store.currentShift ? 'success' : 'danger'" size="large">
            {{ store.currentShift ? store.currentShift.name : "无开班" }}
          </el-tag>
        </div>
      </header>

      <el-tabs v-model="active" class="main-tabs">
        <el-tab-pane name="pump">
          <template #label>开泵预授权</template>
          <OpenPumpView />
        </el-tab-pane>
        <el-tab-pane name="auths">
          <template #label>结算与版本</template>
          <AuthListView />
        </el-tab-pane>
        <el-tab-pane name="shift">
          <template #label>班次交接</template>
          <ShiftView />
        </el-tab-pane>
        <el-tab-pane name="cards">
          <template #label>授权资料</template>
          <CardsView />
        </el-tab-pane>
        <el-tab-pane name="check">
          <template #label>
            <el-badge :value="conflictBadge" :hidden="!conflictBadge" type="danger">
              <span :class="{ 'danger-text': conflictBadge }">一致性自检</span>
            </el-badge>
          </template>
          <ConsistencyView />
        </el-tab-pane>
      </el-tabs>
    </div>
  </main>
</template>
