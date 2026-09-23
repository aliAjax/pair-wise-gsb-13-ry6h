// 金额与时间展示工具

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function cny(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `¥${round2(n).toFixed(2)}`;
}

export function dt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}
