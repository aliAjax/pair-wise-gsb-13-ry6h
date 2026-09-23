<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { fmtTime } from "../domain/id";
import { nextShiftName } from "../domain/shiftNames";
import { useStationStore } from "../store/station";
import type { Shift } from "../domain/types";

const store = useStationStore();

const newName = ref("");
const closingId = ref<string | null>(null);
const plan = reactive({ handling: "", toShiftId: "" });
const message = ref<{ type: "error" | "ok"; text: string } | null>(null);

const ordered = computed(() => [...store.shifts].reverse());

function openCount(shiftId: string): number {
  return store.authorizations.filter(
    (a) => a.status === "open" && a.ownerShiftId === shiftId
  ).length;
}
function openedCount(shiftId: string): number {
  return store.authorizations.filter((a) => a.openedShiftId === shiftId).length;
}
function targetOptions(shift: Shift) {
  return store.shifts.filter((s) => s.id !== shift.id && s.status === "open");
}

function startClose(shift: Shift) {
  closingId.value = shift.id;
  plan.handling = "";
  plan.toShiftId = "__new__";
  message.value = null;
}

function confirmClose(shift: Shift) {
  message.value = null;
  const r = store.closeShift(shift.id, { ...plan });
  if (!r.ok) {
    message.value = { type: "error", text: r.reason };
    return;
  }
  message.value = {
    type: "ok",
    text: shift.handover
      ? `已交接 ${shift.handover.authIds.length} 笔未结授权后关班`
      : "无未结授权，已直接关班"
  };
  closingId.value = null;
}

function create() {
  message.value = null;
  if (!newName.value.trim()) {
    message.value = { type: "error", text: "班次名称必填" };
    return;
  }
  store.createShift(newName.value);
  newName.value = "";
}
</script>

<template>
  <div class="page-grid">
    <section class="list-panel">
      <div class="toolbar">
        <h2>班次交接（{{ store.shifts.length }}）</h2>
      </div>
      <p v-if="message" :class="['alert', message.type]">{{ message.text }}</p>

      <div class="record-grid">
        <article v-for="s in ordered" :key="s.id" class="record">
          <div class="record-head">
            <p class="record-title">{{ s.name }}</p>
            <span :class="['status', s.status === 'open' ? 'status-open' : 'status-settled']">
              {{ s.status === "open" ? "在班" : "已关班" }}
            </span>
          </div>
          <div class="details">
            <span>开班：{{ fmtTime(s.startedAt) }}</span>
            <span>关班：{{ fmtTime(s.closedAt) }}</span>
            <span>本班开泵：{{ openedCount(s.id) }} 笔</span>
            <span>挂账未结：<strong>{{ openCount(s.id) }}</strong> 笔</span>
          </div>

          <div v-if="s.handover" class="handover">
            <p class="h-title">跨班交接单</p>
            <p>接班班次：{{ store.shiftById(s.handover.toShiftId)?.name ?? s.handover.toShiftId }}</p>
            <p>交接授权：{{ s.handover.authIds.length }} 笔（{{ s.handover.authIds.join("，") }}）</p>
            <p class="handling">处理办法：{{ s.handover.handling }}</p>
            <p class="muted">交接时间：{{ fmtTime(s.handover.at) }}</p>
          </div>

          <div v-if="s.status === 'open'" class="actions">
            <button
              v-if="closingId !== s.id"
              type="button"
              @click="startClose(s)"
            >
              办理交接 / 关班
            </button>
            <div v-else class="close-form">
              <p class="warn">
                本班未结 {{ openCount(s.id) }} 笔：未写明处理办法并完成交接前，不得关班。
              </p>
              <label>
                接班班次
                <select v-model="plan.toShiftId">
                  <option value="__new__">新建接班班次（{{ nextShiftName(s.name) }}）</option>
                  <option v-for="t in targetOptions(s)" :key="t.id" :value="t.id">
                    {{ t.name }}
                  </option>
                </select>
              </label>
              <label>
                未结授权处理办法
                <textarea
                  v-model="plan.handling"
                  placeholder="如：客户未加完油跨班，C-1002 油枪05 的冻结授权移交下一班跟进，禁止同卡重复开泵"
                />
              </label>
              <div class="actions">
                <button type="button" class="primary" @click="confirmClose(s)">确认交接并关班</button>
                <button type="button" class="secondary" @click="closingId = null">取消</button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <form class="panel" @submit.prevent="create">
      <h2>手动开班</h2>
      <div class="form-grid">
        <label>
          班次名称
          <input v-model="newName" type="text" placeholder="如 2026-09-24 早班" />
        </label>
        <button class="primary" type="submit">开设班次</button>
      </div>
      <p class="hint">通常在关班交接时自动创建接班班次，仅特殊情况手动开班。</p>
    </form>
  </div>
</template>

<style scoped>
.handover {
  background: #eef5fb;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 10px 0;
  font-size: 13px;
  display: grid;
  gap: 4px;
}
.handover p {
  margin: 0;
  color: #445069;
}
.h-title {
  font-weight: 700;
  color: #176b87;
}
.handling {
  background: #fff;
  border-radius: 6px;
  padding: 8px;
}
.close-form {
  width: 100%;
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.close-form label {
  display: grid;
  gap: 5px;
  font-size: 13px;
  color: #445069;
}
.warn {
  margin: 0;
  color: #b25b1d;
  font-weight: 700;
  font-size: 13px;
}
</style>
