/**
 * 背景类型：纯色 / 图片 / 渐变
 */
export type BackgroundType = 'color' | 'image' | 'gradient';

/**
 * 图片壁纸显示模式
 */
export type BackgroundSize = 'cover' | 'contain' | 'repeat';

/**
 * 卡片视觉模式：solid 实心 / glass 玻璃 / border 边框 / minimal 极简
 */
export type CardStyle = 'solid' | 'glass' | 'border' | 'minimal';

/**
 * 圆角档位
 */
export type RadiusScale = 'none' | 'small' | 'medium' | 'large' | 'pill';

/**
 * 阴影档位
 */
export type ShadowScale = 'none' | 'subtle' | 'medium';

/**
 * 页面布局模式：grid 网格 / list 列表 / mixed 混合（Featured + 其他）
 */
export type LayoutMode = 'grid' | 'list' | 'mixed';

/**
 * 信息密度
 */
export type Density = 'compact' | 'comfortable' | 'spacious';

/**
 * 深浅色偏好
 */
export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * 外观总配置接口
 */
export interface AppearanceConfig {
  /** 预设主题名（见 theme.ts） */
  theme: string;
  /** 自定义主色，留空使用主题 accent */
  accent: string;
  /** 背景 / 壁纸配置 */
  background: {
    type: BackgroundType;
    /** 颜色值 / 图片路径 / 渐变 CSS，type 为 color 且留空时使用主题背景色 */
    value: string;
    /** 壁纸遮罩（保证文字可读性） */
    overlay: {
      enabled: boolean;
      color: string;
      opacity: number;
    };
    /** 壁纸模糊半径（px），背景与前景分离，不影响前景内容 */
    blur: number;
    /** 图片对齐位置 */
    position: string;
    /** 图片显示模式 */
    size: BackgroundSize;
  };
  /** 卡片样式 */
  card: {
    style: CardStyle;
    /** 卡片不透明度（glass 等模式生效） */
    opacity: number;
    /** 圆角档位 */
    radius: RadiusScale;
    /** 阴影档位 */
    shadow: ShadowScale;
  };
  /** 布局 */
  layout: {
    mode: LayoutMode;
    density: Density;
    maxWidth: string;
  };
  /** 字体（留空使用系统字体栈，避免加载变慢） */
  font: {
    sans: string;
    heading: string;
    mono: string;
  };
  /** 装饰效果（默认保持克制，不全部开启） */
  effects: {
    backgroundGlow: boolean;
    noise: boolean;
    grid: boolean;
  };
  /** 头像 / Logo 配置（无图片时自动回退为字母占位） */
  avatar: {
    enabled: boolean;
    /** 图片路径，如 /images/avatar.webp */
    src: string;
    shape: 'circle' | 'rounded' | 'square';
  };
  /** 深浅色默认偏好（用户手动切换后保存在浏览器） */
  themeMode: ThemeMode;
}

/**
 * 外观总配置
 * 修改背景 / 壁纸 / 透明度 / 卡片 / 圆角 / 阴影 / 布局 / 字体等
 */
export const appearance: AppearanceConfig = {
  theme: 'default',
  accent: '',

  background: {
    type: 'color',
    value: '',
    overlay: {
      enabled: false,
      color: '#000000',
      opacity: 0.35
    },
    blur: 0,
    position: 'center',
    size: 'cover'
  },

  card: {
    style: 'minimal',
    opacity: 0.72,
    radius: 'small',
    shadow: 'none'
  },

  layout: {
    mode: 'mixed',
    density: 'comfortable',
    maxWidth: '880px'
  },

  font: {
    sans: '',
    heading: '',
    mono: ''
  },

  effects: {
    backgroundGlow: false,
    noise: false,
    grid: false
  },

  avatar: {
    enabled: false,
    src: '',
    shape: 'rounded'
  },

  themeMode: 'system'
};
