<script setup lang="ts">
// 页面：授权资料（卡片 / 油枪）维护
import { reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useStationStore } from "../stores/station";
import { availableBalance } from "../rules";
import type { FuelCard } from "../domain/types";
import { cny } from "../domain/money";

const store = useStationStore();

const rechargeVisible = ref(false);
const rechargeTarget = ref<FuelCard | null>(null);
const rechargeAmount = reactive({ value: 500 });

function openRecharge(card: FuelCard) {
  rechargeTarget.value = card;
  rechargeAmount.value = 500;
  rechargeVisible.value = true;
}

function confirmRecharge() {
  if (!rechargeTarget.value) return;
  const res = store.recharge(rechargeTarget.value.cardNo, rechargeAmount.value);
  if (res.ok) {
    ElMessage.success("充值成功");
    rechargeVisible.value = false;
    rechargeTarget.value = null;
  } else {
    ElMessage.error(res.message ?? "充值失败");
  }
}

async function toggleLost(card: FuelCard) {
  if (card.status === "lost") {
    await ElMessageBox.confirm(`确认解除卡号 ${card.cardNo} 的挂失状态？`, "解除挂失", { type: "warning" });
    store.setCardStatus(card.cardNo, "normal");
    ElMessage.success("已解除挂失");
  } else {
    await ElMessageBox.confirm(`确认挂失卡号 ${card.cardNo}？挂失后该卡将被禁止开泵。`, "卡片挂失", { type: "warning" });
    store.setCardStatus(card.cardNo, "lost");
    ElMessage.warning("卡片已挂失");
  }
}
</script>

<template>
  <div class="page-grid">
    <el-card shadow="never">
      <template #header><span>加油卡资料</span></template>
      <el-table :data="store.cards" size="small" stripe>
        <el-table-column prop="cardNo" label="卡号" width="80" />
        <el-table-column prop="holder" label="持卡人" min-width="140" />
        <el-table-column prop="plate" label="绑定车牌" width="110" />
        <el-table-column label="账户余额" width="100">
          <template #default="{ row }">{{ cny(row.balance) }}</template>
        </el-table-column>
        <el-table-column label="可用（扣冻结）" width="120">
          <template #default="{ row }">{{ cny(availableBalance(store.db, row)) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="86">
          <template #default="{ row }">
            <el-tag :type="row.status === 'lost' ? 'danger' : 'success'" size="small">
              {{ row.status === "lost" ? "已挂失" : "正常" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openRecharge(row)">充值</el-button>
            <el-button size="small" :type="row.status === 'lost' ? 'success' : 'warning'" @click="toggleLost(row)">
              {{ row.status === "lost" ? "解除挂失" : "挂失" }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header><span>油枪资料</span></template>
      <el-table :data="store.pumps" size="small" stripe>
        <el-table-column label="油枪号" width="90">
          <template #default="{ row }">{{ row.no }}号枪</template>
        </el-table-column>
        <el-table-column prop="fuel" label="油品" min-width="140" />
        <el-table-column label="占用情况" min-width="160">
          <template #default="{ row }">
            <el-tag v-if="store.auths.some((a) => a.status === 'frozen' && a.pumpNo === row.no)" type="warning" size="small">
              加油中·冻结
            </el-tag>
            <el-tag v-else type="success" size="small">空闲</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>

  <el-dialog v-model="rechargeVisible" title="卡片充值" width="380px">
    <div v-if="rechargeTarget" class="dialog-stack">
      <p>卡号 {{ rechargeTarget.cardNo }} ｜ 当前余额 {{ cny(rechargeTarget.balance) }}</p>
      <el-input-number v-model="rechargeAmount.value" :min="1" :precision="2" :step="100" controls-position="right" style="width: 100%" />
    </div>
    <template #footer>
      <el-button @click="rechargeVisible = false">取消</el-button>
      <el-button type="primary" @click="confirmRecharge">确认充值</el-button>
    </template>
  </el-dialog>
</template>
