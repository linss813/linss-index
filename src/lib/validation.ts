/**
 * 请求参数验证规则
 * 集中定义 Zod Schema，供全部后台 API 端点复用
 */
import { z } from 'zod';

/**
 * 安全 URL 验证规则
 * 只允许 http:// 和 https:// 协议，阻止 javascript: / data: 等危险协议
 */
export const urlSchema = z
  .url()
  .refine(
    (v) => v.startsWith('http://') || v.startsWith('https://'),
    { message: 'URL 必须以 http:// 或 https:// 开头' }
  );

/**
 * 可选安全 URL 验证规则
 * 空字符串会被转换为 null，非空时必须为 http/https URL
 */
export const optionalUrlSchema = z
  .union([urlSchema, z.literal('')])
  .transform((v) => (v === '' ? null : v));

/**
 * 分页/显示方式枚举
 * 服务在页面中的三种展示形态（与 V1 配置保持兼容）
 */
export const displaySchema = z.enum(['featured', 'card', 'list']);

/**
 * 解析并校验批量操作的 ID 数组
 * 允许正整数或纯数字字符串（前端表单值可能是字符串），其余一律拒绝
 * @param value 待校验的请求体 ids 字段
 * @param max 数量上限（默认 100，防止误传超大数组）
 * @returns 有效的正整数 ID 数组；非数组、为空、超限或含非法值时返回 null
 */
export function parseIdArray(value: unknown, max = 100): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const ids: number[] = [];
  for (const v of value) {
    const n =
      typeof v === 'number'
        ? Math.floor(v)
        : typeof v === 'string' && /^\d+$/.test(v)
          ? parseInt(v, 10)
          : NaN;
    if (!Number.isInteger(n) || n <= 0) return null;
    ids.push(n);
  }
  return ids;
}
