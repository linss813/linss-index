/**
 * 主题色板接口
 */
export interface ThemePalette {
  /** 页面背景色 */
  background: string;
  /** 主要文字颜色 */
  foreground: string;
  /** 次要文字颜色 */
  muted: string;
  /** 主色（链接 / Hover / 按钮等强调元素） */
  accent: string;
  /** 卡片基色（可结合透明度使用） */
  card: string;
  /** 边框颜色 */
  border: string;
}

/**
 * 主题定义：每个主题包含浅色 / 深色两套色板，
 * 由 DesignTokens.astro 在构建时转换为 CSS Variables
 */
export interface ThemeDefinition {
  light: ThemePalette;
  dark: ThemePalette;
}

/**
 * 预设主题
 * 新增主题在此添加即可；颜色保持克制，不使用过度鲜艳的颜色
 */
export const themes: Record<string, ThemeDefinition> = {
  /** 中性极简（默认） */
  default: {
    light: {
      background: '#fafafa',
      foreground: '#18181b',
      muted: '#71717a',
      accent: '#2563eb',
      card: '#ffffff',
      border: 'rgba(24, 24, 27, 0.09)'
    },
    dark: {
      /** 柔和深灰蓝：替代近黑的 #09090b，降低夜间视觉疲劳 */
      background: '#15171e',
      foreground: '#f2f3f5',
      muted: '#9aa2ae',
      accent: '#60a5fa',
      card: 'rgba(255, 255, 255, 0.06)',
      border: 'rgba(255, 255, 255, 0.12)'
    }
  },

  /** 深夜蓝黑（冷色调，适合深色爱好者） */
  midnight: {
    light: {
      background: '#f4f6fb',
      foreground: '#1d2433',
      muted: '#64708a',
      accent: '#4c6ef5',
      card: '#ffffff',
      border: 'rgba(29, 36, 51, 0.1)'
    },
    dark: {
      /** 柔和藏蓝：保留冷色气质的同时提升亮度，避免纯黑底 */
      background: '#141b2c',
      foreground: '#e5eaf4',
      muted: '#93a0ba',
      accent: '#7aa2f7',
      card: 'rgba(151, 166, 201, 0.09)',
      border: 'rgba(151, 166, 201, 0.16)'
    }
  },

  /** 纸质暖调（米白 / 暖棕，阅读感强） */
  paper: {
    light: {
      background: '#f6f3ec',
      foreground: '#2d2a24',
      muted: '#857d6e',
      accent: '#8f6b44',
      card: '#fffdf7',
      border: 'rgba(80, 70, 50, 0.12)'
    },
    dark: {
      /** 柔和暖深棕：替代近黑的 #191713，保持纸感温度 */
      background: '#232018',
      foreground: '#ede8dc',
      muted: '#a89f8d',
      accent: '#d8ab74',
      card: 'rgba(237, 232, 220, 0.06)',
      border: 'rgba(237, 232, 220, 0.12)'
    }
  }
};
