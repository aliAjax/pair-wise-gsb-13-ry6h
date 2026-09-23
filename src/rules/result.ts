// 判定结果包装：成功返回 data，失败返回拒绝原因码与说明（保留输入由页面负责）
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; reason: string };

export function succeed<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function reject(code: string, reason: string): Result<never> {
  return { ok: false, code, reason };
}
