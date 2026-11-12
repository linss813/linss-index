/**
 * 背景预设库单元测试
 * 覆盖 src/config/backgroundPresets.ts 中的纯色与渐变预设结构及格式合法性
 */
import { describe, it, expect } from 'vitest';
import { COLOR_PRESETS, GRADIENT_PRESETS } from '../src/config/backgroundPresets';

/** 合法 6 位 HEX 颜色格式 */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** 从渐变字符串中提取所有 HEX 颜色值 */
function extractHexColors(gradient: string): string[] {
  return gradient.match(/#[0-9a-fA-F]{6}/g) ?? [];
}

describe('COLOR_PRESETS — 纯色背景预设', () => {
  it('为非空数组', () => {
    expect(Array.isArray(COLOR_PRESETS)).toBe(true);
    expect(COLOR_PRESETS.length).toBeGreaterThan(0);
  });

  it('每一项均为合法的 6 位 HEX 颜色', () => {
    for (const c of COLOR_PRESETS) {
      expect(c).toMatch(HEX_RE);
    }
  });

  it('无重复色值', () => {
    expect(new Set(COLOR_PRESETS).size).toBe(COLOR_PRESETS.length);
  });

  it('包含与暗夜模式色板呼应的核心暗色预设', () => {
    // v2.1.0 调整的暗色主题背景色，预设库需持续提供
    for (const dark of ['#15171e', '#141b2c', '#232018']) {
      expect(COLOR_PRESETS).toContain(dark);
    }
  });

  it('同时包含暗色与浅色系（满足亮/暗主题切换需求）', () => {
    const hasDark = COLOR_PRESETS.some((c) => parseInt(c.slice(1, 3), 16) < 0x50);
    const hasLight = COLOR_PRESETS.some((c) => parseInt(c.slice(1, 3), 16) > 0xb0);
    expect(hasDark).toBe(true);
    expect(hasLight).toBe(true);
  });
});

describe('GRADIENT_PRESETS — 渐变背景预设', () => {
  it('为非空数组', () => {
    expect(Array.isArray(GRADIENT_PRESETS)).toBe(true);
    expect(GRADIENT_PRESETS.length).toBeGreaterThan(0);
  });

  it('每一项均为 linear-gradient 声明', () => {
    for (const g of GRADIENT_PRESETS) {
      expect(g.startsWith('linear-gradient(')).toBe(true);
      expect(g.endsWith(')')).toBe(true);
    }
  });

  it('每一项至少包含两个合法 HEX 颜色（渐变端点）', () => {
    for (const g of GRADIENT_PRESETS) {
      const colors = extractHexColors(g);
      expect(colors.length).toBeGreaterThanOrEqual(2);
      for (const c of colors) {
        expect(c).toMatch(HEX_RE);
      }
    }
  });

  it('无重复渐变', () => {
    expect(new Set(GRADIENT_PRESETS).size).toBe(GRADIENT_PRESETS.length);
  });
});
