/**
 * 快捷链接接口定义
 */
export interface QuickLink {
  /** 链接名称 */
  name: string;
  /** 链接地址 */
  url: string;
  /** 图标名称（可用图标见 src/components/Icon.astro） */
  icon?: string;
  /** 是否为新窗口打开的外部链接 */
  external?: boolean;
}

/**
 * GitHub 主页地址（配置项，修改为你的 GitHub 账号主页即可）
 */
export const githubUrl = 'https://github.com';

/**
 * Hero 区域快捷链接配置
 * 独立于服务列表管理，仅展示最常用的入口
 */
export const quickLinks: QuickLink[] = [
  {
    name: 'Blog',
    url: 'https://blog.luen0511.com',
    icon: 'book-open',
    external: false
  },
  {
    name: 'Files',
    url: 'https://files.luen0511.com',
    icon: 'folder',
    external: false
  },
  {
    name: 'GitHub',
    url: githubUrl,
    icon: 'github',
    external: true
  }
];

/**
 * 页脚导航链接
 * 纯文字链接（无图标），展示在页面底部导航区；
 * 可自行增加 Email（mailto:）、About 等条目
 */
export const footerLinks: QuickLink[] = [
  {
    name: 'GitHub',
    url: githubUrl,
    external: true
  },
  {
    name: 'Blog',
    url: 'https://blog.luen0511.com',
    external: false
  }
];
