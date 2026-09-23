function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 早班 → 中班 → 晚班 → 次日早班 */
export function nextShiftName(name: string): string {
  const date = name.slice(0, 10);
  if (name.includes("早班")) return `${date} 中班`;
  if (name.includes("中班")) return `${date} 晚班`;
  if (name.includes("晚班")) return `${nextDate(date)} 早班`;
  return `${name}（接班）`;
}
