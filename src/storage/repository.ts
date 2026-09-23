// 存储层：只负责 localStorage 读写与数据迁移，不含任何业务判定
// 卡片、授权、班次、版本分键存储，读取时合并
import type {
  AuthVersionRecord,
  Database,
  FuelCard,
  PreAuth,
  Pump,
  Shift
} from "../domain/types";
import { seedDatabase } from "../domain/seed";

const VERSION = 1;
const KEYS = {
  cards: "gsp.cards.v1",
  auths: "gsp.auths.v1",
  shifts: "gsp.shifts.v1",
  versions: "gsp.versions.v1",
  boot: "gsp.boot.v1",
  operator: "gsp.operator.v1"
} as const;

function read<T>(key: string): T[] | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, rows: T[]): void {
  localStorage.setItem(key, JSON.stringify(rows));
}

export function exists(): boolean {
  return localStorage.getItem(KEYS.boot) !== null;
}

export function loadDatabase(): Database {
  if (!exists()) {
    const seed = seedDatabase();
    saveDatabase(seed);
    return seed;
  }
  const fallback = seedDatabase();
  return {
    cards: read<FuelCard>(KEYS.cards) ?? fallback.cards,
    pumps: fallback.pumps,
    auths: read<PreAuth>(KEYS.auths) ?? [],
    shifts: read<Shift>(KEYS.shifts) ?? [],
    versions: read<AuthVersionRecord>(KEYS.versions) ?? []
  };
}

export function saveDatabase(db: Database): void {
  write(KEYS.cards, db.cards);
  write(KEYS.auths, db.auths);
  write(KEYS.shifts, db.shifts);
  write(KEYS.versions, db.versions);
  localStorage.setItem(KEYS.boot, JSON.stringify({ version: VERSION, at: new Date().toISOString() }));
}

export function resetDatabase(): Database {
  const seed = seedDatabase();
  saveDatabase(seed);
  return seed;
}

export function loadOperator(): string {
  return localStorage.getItem(KEYS.operator) ?? "王芳";
}

export function saveOperator(name: string): void {
  localStorage.setItem(KEYS.operator, name);
}
