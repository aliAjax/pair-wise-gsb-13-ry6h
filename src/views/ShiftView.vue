<script setup lang="ts">
// 页面：开班 / 关班交接。未结授权逐条写处理办法，处理前不得关班
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useStationStore } from "../stores/station";
import { evaluateCloseShift } from "../rules";
import { cny, dt } from "../domain/money";

const store = useStationStore();

const openName = ref("");

const pending = computed(() => (store.currentShift ? store.pendingAuths(store.currentShift.id) : []));
const handoverNotes = reactive<Record<string, string>>({});
const closeVisible = ref(false);

function defaultShiftName(): string {
  const now = new Date();
  const hour = now.getHours();
  const slot = hour < 14 ? "中班" : hour < 22 ? "晚班" : "夜班";
  const date = now.toISOString().slice(0, 10);
  return `${slot} ${date}`;
}

function doOpen() {
  const name = openName.value.trim() || defaultShiftName();
  const res = store.openShift(name);
  if (res.ok) {
    ElMessage.success(`已开班：${name}，跨班挂账授权已接手`);
    openName.value = "";
  } else {
    ElMessage.error(res.message ?? "开班失败");
  }
}

function openClose() {
  for (const a of pending.value) {
    if (!handoverNotes[a.id]) {
      handoverNotes[a.id] =
        a.handoverTrail.length > 0
          ? `继续跟进：${a.handoverTrail[a.handoverTrail.length - 1].note}`
          : "";
    }
  }
  closeVisible.value = true;
}

const closeCheck = computed(() =>
  store.currentShift ? evaluateCloseShift(store.db, store.currentShift.id, handoverNotes) : { pendingCount: 0, canClose: false, missing: [] }
);

function doClose() {
  const res = store.closeShift(handoverNotes);
  if (res.ok) {
    ElMessage.success("已关班，未结授权随交接处理办法跨班挂账");
    closeVisible.value = false;
    for (const key of Object.keys(handoverNotes)) delete handoverNotes[key];
  } else {
    ElMessage.error(res.message ?? "关班失败");
  }
}
</script>

<template>
  <div class="page-grid">
    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span>当前班次</span>
          <el-tag v-if="store.currentShift" type="success" size="small">进行中</el-tag>
          <el-tag v-else type="info" size="small">无开班</el-tag>
        </div>
      </template>

      <template v-if="store.currentShift">
        <h3 class="shift-name">{{ store.currentShift.name }}</h3>
        <p class="muted">开班时间：{{ dt(store.currentShift.openedAt) }}</p>
        <p>
          本班未结授权：<strong>{{ pending.length }}</strong> 条，
          冻结合计 <strong>{{ cny(pending.reduce((s, a) => s + a.amount, 0)) }}</strong>
        </p>
        <el-alert
          v-if="pending.length > 0"
          type="warning"
          show-icon
          :closable="false"
          title="处理前不得关班：以下未结授权必须逐条填写跨班交接处理办法"
          class="shift-alert"
        />
        <el-table v-if="pending.length" :data="pending" size="small" stripe class="shift-table">
          <el-table-column prop="id" label="授权号" width="92" />
          <el-table-column prop="cardNo" label="卡号" width="70" />
          <el-table-column label="油枪" width="60">
            <template #default="{ row }">枪{{ row.pumpNo }}</template>
          </el-table-column>
          <el-table-column label="冻结" width="84">
            <template #default="{ row }">{{ cny(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="交接历史" min-width="120">
            <template #default="{ row }">
              <el-tag v-for="(h, i) in row.handoverTrail" :key="i" type="danger" size="small" class="handover-tag">
                {{ h.shiftName }}
              </el-tag>
              <span v-if="!row.handoverTrail.length" class="muted">本班新开</span>
            </template>
          </el-table-column>
        </el-table>
        <el-button type="danger" :disabled="pending.length > 0" class="full" @click="doClose">
          关班交接
        </el-button>
        <el-button v-if="pending.length > 0" type="warning" class="full" @click="openClose">
          填写处理办法并关班（{{ pending.length }} 条未结）
        </el-button>
      </template>

      <template v-else>
        <el-empty description="当前无开班" :image-size="70" />
        <el-form label-position="top" @submit.prevent="doOpen">
          <el-form-item label="班次名称（留空自动生成）">
            <el-input v-model="openName" :placeholder="defaultShiftName()" />
          </el-form-item>
          <el-button type="primary" class="full" native-type="submit">开班并接手挂账</el-button>
        </el-form>
      </template>
    </el-card>

    <el-card shadow="never">
      <template #header><span>班次历史</span></template>
      <el-table :data="store.sortedShifts" size="small" stripe>
        <el-table-column prop="name" label="班次" min-width="150" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'open' ? 'success' : 'info'" size="small">
              {{ row.status === "open" ? "进行中" : "已关班" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开班" min-width="160">
          <template #default="{ row }">{{ dt(row.openedAt) }}</template>
        </el-table-column>
        <el-table-column label="关班" min-width="160">
          <template #default="{ row }">{{ dt(row.closedAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>

  <!-- 关班交接：逐条处理办法 -->
  <el-dialog v-model="closeVisible" title="跨班交接处理办法" width="620px">
    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="关班后未结授权进入跨班挂账，由下一班接手；处理办法不可为空。"
      class="shift-alert"
    />
    <div v-for="auth in pending" :key="auth.id" class="handover-item">
      <p class="handover-head">
        {{ auth.id }} ｜ 卡号 {{ auth.cardNo }} ｜ 枪{{ auth.pumpNo }} ｜ {{ auth.plate }} ｜ 冻结 {{ cny(auth.amount) }}
      </p>
      <div v-if="auth.handoverTrail.length" class="handover-history">
        <p v-for="(h, i) in auth.handoverTrail" :key="i" class="muted">
          {{ h.shiftName }} 处理办法：{{ h.note }}（{{ dt(h.at) }}）
        </p>
      </div>
      <el-input
        v-model="handoverNotes[auth.id]"
        type="textarea"
        :rows="2"
        placeholder="填写本笔未结授权的处理办法，如客户约定时间、联系人、预计结算方式"
      />
    </div>
    <template #footer>
      <el-button @click="closeVisible = false">取消</el-button>
      <el-button type="danger" :disabled="!closeCheck.canClose" @click="doClose">
        确认交接并关班{{ !closeCheck.canClose ? `（还差 ${closeCheck.missing.length} 条处理办法）` : "" }}
      </el-button>
    </template>
  </el-dialog>
</template>
