<script setup lang="ts">
// 页面：重开一致性自检。冲突固定展示 卡号、油枪、差额、规则
import { ElMessage, ElMessageBox } from "element-plus";
import { useStationStore } from "../stores/station";

const store = useStationStore();

function rerun() {
  store.reload();
  ElMessage.success("已从本地存储重新载入并重跑一致性自检");
}

async function resetDemo() {
  await ElMessageBox.confirm("将清空当前数据并恢复演示种子数据，确认继续？", "恢复演示数据", { type: "warning" });
  store.resetDemo();
  ElMessage.success("已恢复演示数据");
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-head">
        <span>重开一致性自检（卡片 / 授权 / 班次 / 版本）</span>
        <div>
          <el-button size="small" @click="rerun">重新载入并自检</el-button>
          <el-button size="small" type="warning" @click="resetDemo">恢复演示数据</el-button>
        </div>
      </div>
    </template>

    <el-result
      v-if="store.conflicts.length === 0"
      icon="success"
      title="一致"
      sub-title="卡片余额与冻结额、授权引用、班次归属、版本快照全部一致"
    />

    <template v-else>
      <el-alert
        type="error"
        show-icon
        :closable="false"
        :title="`发现 ${store.conflicts.length} 项冲突，处理前请核对卡号、油枪、差额与对应规则`"
        class="shift-alert"
      />
      <el-table :data="store.conflicts" size="small" stripe>
        <el-table-column prop="cardNo" label="卡号" width="120" />
        <el-table-column prop="pumpNo" label="油枪" min-width="110" />
        <el-table-column label="差额" width="110" align="right">
          <template #default="{ row }">
            <el-tag v-if="row.delta !== null" :type="row.delta < 0 ? 'danger' : 'warning'" size="small">
              {{ row.delta > 0 ? "+" : "" }}{{ row.delta.toFixed(2) }}
            </el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="rule" label="违反规则" min-width="200" />
        <el-table-column prop="detail" label="说明" min-width="260" />
      </el-table>
    </template>
  </el-card>
</template>
