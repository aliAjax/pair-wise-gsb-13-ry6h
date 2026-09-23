export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function yuan(value: number | null | undefined): string {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}
