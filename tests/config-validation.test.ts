import { describe, expect, it } from 'vitest';
import { appearance } from '../src/config/appearance';
import {
  parseAppearance,
  parseThemeDefinition,
  validateAppearanceJson,
} from '../src/lib/config-validation';

describe('appearance runtime validation', () => {
  it('缺失的嵌套字段使用默认值补齐', () => {
    const result = validateAppearanceJson(JSON.stringify({
      layout: { mode: 'grid' },
      effects: { noise: true },
    }));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layout.mode).toBe('grid');
    expect(result.data.layout.density).toBe(appearance.layout.density);
    expect(result.data.effects.noise).toBe(true);
    expect(result.data.background).toEqual(appearance.background);
  });

  it('拒绝可逃逸内联 CSS/JS 的持久化值', () => {
    const result = validateAppearanceJson(JSON.stringify({
      themeMode: "system';alert(1);//",
      font: { sans: "safe';color:red" },
    }));
    expect(result.success).toBe(false);
  });

  it('读取损坏配置时回退完整默认值', () => {
    expect(parseAppearance('{broken')).toEqual(appearance);
    expect(parseAppearance(JSON.stringify({ layout: { maxWidth: '1px; color:red' } }))).toEqual(appearance);
  });

  it('规范化后只保留已知字段', () => {
    const result = validateAppearanceJson(JSON.stringify({ unknown: 'drop-me' }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('unknown');
  });
});

describe('theme runtime validation', () => {
  const validTheme = {
    light: {
      background: '#ffffff', foreground: '#111111', muted: '#666666',
      accent: '#2563eb', card: 'rgba(255, 255, 255, 0.8)', border: 'rgba(0, 0, 0, 0.1)',
    },
    dark: {
      background: '#111111', foreground: '#ffffff', muted: '#aaaaaa',
      accent: '#60a5fa', card: 'rgba(255, 255, 255, 0.06)', border: 'rgba(255, 255, 255, 0.12)',
    },
  };

  it('接受完整合法色板', () => {
    expect(parseThemeDefinition(JSON.stringify(validTheme))).toEqual(validTheme);
  });

  it('拒绝 CSS 注入与缺字段色板', () => {
    const injected = structuredClone(validTheme);
    injected.light.accent = '#fff;}</style><script>alert(1)</script>';
    expect(parseThemeDefinition(JSON.stringify(injected))).toBeNull();
    expect(parseThemeDefinition(JSON.stringify({ light: validTheme.light }))).toBeNull();
  });
});
