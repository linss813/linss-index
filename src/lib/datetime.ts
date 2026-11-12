/**
 * 时间显示工具
 * 数据库时间统一为 SQLite UTC（datetime('now')，"YYYY-MM-DD HH:mm:ss"，无时区标记）
 * 展示层统一经本模块格式化，避免各组件散落处理导致时区错误
 */

/**
 * 解析数据库时间字符串为 Date（按 UTC 语义）
 * @param value SQLite UTC 字符串（"YYYY-MM-DD HH:mm:ss"）或 ISO 字符串
 * @returns 对应的 Date；无法解析时返回 null
 */
export function parseDbTime(value: string): Date | null {
  if (!value) return null;
  // SQLite datetime 格式无时区标记，补 Z 按 UTC 解析；ISO 字符串直接解析
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 将数据库 UTC 时间格式化为本地时区 "YYYY-MM-DD HH:mm:ss"（后台列表用）
 * @param value 数据库时间字符串
 * @returns 本地时区格式化结果；无法解析时原样返回
 */
export function formatUtcToLocal(value: string): string {
  const d = parseDbTime(value);
  if (!d) return value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 将数据库 UTC 时间格式化为前台短日期（如 "Sep 02, 2026"）
 * @param value 数据库时间字符串
 * @returns 英文短日期；无法解析时返回空字符串
 */
export function formatDateShort(value: string): string {
  const d = parseDbTime(value);
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/** Public activity always uses Shanghai dates, independently of server timezone. */
export function formatShanghai(value: string): string {
  const date = parseDbTime(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
