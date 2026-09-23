<script setup lang="ts">
import { ref } from "vue";
import { yuan } from "../domain/money";
import { useStationStore } from "../store/station";
import type { FuelCard } from "../domain/types";

const store = useStationStore();
const topUpCardNo = ref<string | null>(null);
const topUpAmount = ref(0);
const message = ref<string | null>(null);

function frozenOf(cardNo: string): number {
  return store.openAuths
    .filter((a) => a.cardNo === cardNo)
    .reduce((s, a) => s + a.frozenAmount, 0);
}

function doTopUp(card: FuelCard) {
  message.value = null;
  const r = store.topUp(card, Number(topUpAmount));
  if (!r.ok) {
    message.value = r.reason;
  } else {
    message.value = `${card.cardNo} 充值成功`;
    topUpCardNo.value = null;
    topUpAmount.value = 0;
  }
}
</script>

<template>
  <section class="list-panel wide">
    <div class="toolbar">
      <h2>卡片资料（{{ store.cards.length }}）</h2>
      <span class="muted">可用余额 = 卡内余额 − 未结冻结额</span>
    </div>
    <p v-if="message" class="alert ok">{{ message }}</p>

    <div class="card-grid">
      <article v-for="c in store.cards" :key="c.cardNo" :class="['card', c.status]">
        <div class="card-head">
          <p class="card-no">{{ c.cardNo }}</p>
          <span :class="['status', c.status === 'lost' ? 'status-lost' : 'status-open']">
            {{ c.status === "lost" ? "已挂失" : "正常" }}
          </span>
        </div>
        <p class="plate">{{ c.holderPlate }}</p>
        <div class="balances">
          <div><span>卡内余额</span><strong>{{ yuan(c.balance) }}</strong></div>
          <div><span>未结冻结</span><strong>{{ yuan(frozenOf(c.cardNo)) }}</strong></div>
          <div class="avail">
            <span>可用余额</span><strong>{{ yuan(store.availableOf(c.cardNo)) }}</strong>
          </div>
        </div>
        <p v-if="c.note" class="note">{{ c.note }}</p>
        <div class="actions">
          <button
            v-if="c.status === 'normal'"
            type="button"
            class="danger"
            @click="store.reportLost(c)"
          >
            挂失
          </button>
          <button v-else type="button" class="secondary" @click="store.restoreCard(c)">
            解除挂失
          </button>
          <button type="button" class="secondary" @click="topUpCardNo = c.cardNo">充值</button>
        </div>
        <div v-if="topUpCardNo === c.cardNo" class="topup">
          <input v-model.number="topUpAmount" type="number" min="0" step="0.01" placeholder="充值金额" />
          <button type="button" class="primary" @click="doTopUp(c)">确认</button>
          <button type="button" class="secondary" @click="topUpCardNo = null">取消</button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.card {
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  padding: 16px;
  background: linear-gradient(135deg, #fbfcfe, #f2f6fb);
  display: grid;
  gap: 10px;
}
.card.lost {
  background: #f7f7f8;
  opacity: 0.85;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-no {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 1px;
}
.plate {
  margin: 0;
  color: #536078;
  font-size: 14px;
}
.balances {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.balances div {
  background: #fff;
  border-radius: 8px;
  padding: 8px;
  text-align: center;
}
.balances span {
  display: block;
  font-size: 11px;
  color: #7a869c;
}
.balances strong {
  font-size: 15px;
}
.balances .avail {
  background: #e8f1f5;
}
.balances .avail strong {
  color: #176b87;
}
.topup {
  display: flex;
  gap: 6px;
}
.topup input {
  min-width: 0;
  flex: 1;
}
</style>
