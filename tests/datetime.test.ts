/**
 * 时间显示工具单元测试
 * 覆盖：SQLite UTC 解析、后台本地格式化、前台短日期格式化
 */
import { describe, it, expect } from 'vitest';
import { parseDbTime, formatUtcToLocal, formatDateShort } from '../src/lib/datetime';

describe('parseDbTime — 数据库时间解析', () => {
  it('SQLite UTC 格式按 UTC 语义解析（"YYYY-MM-DD HH:mm:ss"）', () => {
    const d = parseDbTime('2026-09-02 12:00:00')!;
    expect(d).not.toBeNull();
    // UTC 语义：UTC 小时数应与字符串一致，不受运行环境时区影响
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(8); // 9 月（0 基）
    expect(d.getUTCDate()).toBe(2);
    expect(d.getUTCHours()).toBe(12);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it('ISO 字符串（含 Z）正确解析', () => {
    const d = parseDbTime('2026-09-02T12:00:00Z')!;
    expect(d.getUTCHours()).toBe(12);
  });

  it('非法字符串返回 null', () => {
    expect(parseDbTime('')).toBeNull();
    expect(parseDbTime('not-a-time')).toBeNull();
  });
});

describe('formatUtcToLocal — 后台本地时间格式化', () => {
  it('输出格式为 "YYYY-MM-DD HH:mm:ss"', () => {
    const out = formatUtcToLocal('2026-09-02 12:00:00');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('格式化结果与解析后的本地时间一致（无时区漂移）', () => {
    const utc = '2026-09-02 12:00:00';
    const d = parseDbTime(utc)!;
    const p = (n: number) => String(n).padStart(2, '0');
    const expected = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    expect(formatUtcToLocal(utc)).toBe(expected);
  });

  it('无法解析时原样返回（不产出 Invalid Date 文本）', () => {
    expect(formatUtcToLocal('bad-input')).toBe('bad-input');
  });
});

describe('formatDateShort — 前台短日期格式化', () => {
  it('输出英文短日期格式（如 "Sep 02, 2026"）', () => {
    const out = formatDateShort('2026-09-02 12:00:00');
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{2}, \d{4}$/);
  });

  it('无法解析时返回空字符串', () => {
    expect(formatDateShort('bad')).toBe('');
  });
});
