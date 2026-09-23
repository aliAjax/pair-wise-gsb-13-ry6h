/** 车牌归一化：去掉间隔符并转大写，便于比对 */
export function normalizePlate(plate: string): string {
  return plate.replace(/[^0-9A-Za-z一-龥]/g, "").toUpperCase();
}
