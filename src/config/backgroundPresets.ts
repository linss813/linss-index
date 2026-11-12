/**
 * 背景预设库（仅纯色与渐变，不含图片）
 * 供后台「壁纸与背景」页的预设色块使用
 */

/** 纯色背景预设：常用深浅底色（深色系与暗夜模式色板呼应，浅色系适合亮色主题） */
export const COLOR_PRESETS: string[] = [
  '#10131a', '#15171e', '#141b2c', '#232018', '#1b2a33', '#2d2a24',
  '#ffffff', '#f5f3ee', '#e8eef7', '#eef2f7', '#f7e8e8', '#e8f4ea',
];

/** 渐变背景预设：常用 CSS 渐变效果（需满足后台渐变校验规则） */
export const GRADIENT_PRESETS: string[] = [
  'linear-gradient(135deg, #1a1a2e, #16213e)',
  'linear-gradient(135deg, #0f2027, #2c5364)',
  'linear-gradient(135deg, #141e30, #243b55)',
  'linear-gradient(135deg, #232526, #414345)',
  'linear-gradient(135deg, #1f1c2c, #928dab)',
  'linear-gradient(135deg, #c31432, #240b36)',
  'linear-gradient(135deg, #f6f3ec, #e0d9c8)',
  'linear-gradient(135deg, #e8eef7, #c9d8ee)',
];
