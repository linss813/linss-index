/**
 * 验证规则单元测试
 * 覆盖 src/lib/validation.ts 中的 URL 安全校验、枚举规则与批量 ID 数组校验
 */
import { describe, it, expect } from 'vitest';
import { urlSchema, displaySchema, parseIdArray } from '../src/lib/validation';

describe('urlSchema — 安全 URL 验证', () => {
  it('接受合法的 https URL', () => {
    const result = urlSchema.safeParse('https://blog.luen0511.com');
    expect(result.success).toBe(true);
  });

  it('接受合法的 http URL', () => {
    const result = urlSchema.safeParse('http://localhost:8080/service');
    expect(result.success).toBe(true);
  });

  it('拒绝 javascript: 协议（XSS 攻击向量）', () => {
    const result = urlSchema.safeParse('javascript:alert(1)');
    expect(result.success).toBe(false);
  });

  it('拒绝 data: 协议', () => {
    const result = urlSchema.safeParse('data:text/html,<script>');
    expect(result.success).toBe(false);
  });

  it('拒绝 ftp: 协议', () => {
    const result = urlSchema.safeParse('ftp://files.example.com');
    expect(result.success).toBe(false);
  });

  it('拒绝非 URL 字符串', () => {
    const result = urlSchema.safeParse('not-a-url');
    expect(result.success).toBe(false);
  });

  it('拒绝空字符串', () => {
    const result = urlSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('displaySchema — 服务显示方式枚举', () => {
  it('接受三种合法显示方式', () => {
    for (const v of ['featured', 'card', 'list']) {
      expect(displaySchema.safeParse(v).success).toBe(true);
    }
  });

  it('拒绝未定义的显示方式', () => {
    expect(displaySchema.safeParse('grid').success).toBe(false);
    expect(displaySchema.safeParse('').success).toBe(false);
  });
});

describe('parseIdArray — 批量操作 ID 数组校验', () => {
  it('接受正整数数组', () => {
    expect(parseIdArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('接受纯数字字符串数组（前端表单值场景）', () => {
    expect(parseIdArray(['1', '22', '333'])).toEqual([1, 22, 333]);
  });

  it('接受数字与数字字符串混合数组', () => {
    expect(parseIdArray([1, '2', 3])).toEqual([1, 2, 3]);
  });

  it('拒绝空数组', () => {
    expect(parseIdArray([])).toBeNull();
  });

  it('拒绝非数组输入（字符串 / 数字 / null / undefined / 对象）', () => {
    expect(parseIdArray('1,2,3')).toBeNull();
    expect(parseIdArray(123)).toBeNull();
    expect(parseIdArray(null)).toBeNull();
    expect(parseIdArray(undefined)).toBeNull();
    expect(parseIdArray({ ids: [1] })).toBeNull();
  });

  it('拒绝含 0 或负数的数组', () => {
    expect(parseIdArray([1, 0, 3])).toBeNull();
    expect(parseIdArray([1, -2, 3])).toBeNull();
  });

  it('拒绝含非数字字符串的数组', () => {
    expect(parseIdArray(['1', 'abc'])).toBeNull();
    expect(parseIdArray(['1', '1.5'])).toBeNull();
    expect(parseIdArray(['1', ''])).toBeNull();
  });

  it('拒绝含 NaN / Infinity 的数组', () => {
    expect(parseIdArray([1, NaN])).toBeNull();
    expect(parseIdArray([1, Infinity])).toBeNull();
  });

  it('超过默认数量上限（100）时拒绝', () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => i + 1);
    expect(parseIdArray(tooMany)).toBeNull();
  });

  it('恰好等于默认数量上限（100）时通过', () => {
    const exactly100 = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(parseIdArray(exactly100)).toHaveLength(100);
  });

  it('支持自定义数量上限', () => {
    expect(parseIdArray([1, 2, 3], 2)).toBeNull();
    expect(parseIdArray([1, 2], 2)).toEqual([1, 2]);
  });

  it('不修改原数组引用（返回新数组）', () => {
    const input = [3, 1, 2];
    const result = parseIdArray(input);
    expect(result).toEqual([3, 1, 2]);
    expect(result).not.toBe(input);
  });
});
