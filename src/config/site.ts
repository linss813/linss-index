/**
 * 站点信息配置
 * 页面中的网站名称、标题、描述、文案统一从这里读取，禁止在组件中硬编码
 */
export const siteConfig = {
  /** 站点名称 */
  name: 'Luen0511',
  /** SEO 标题 */
  title: 'Luen0511 · 文字、日常与实用工具',
  /** SEO 描述 */
  description: 'Luen0511 的个人博客与工具入口。记录生活、分享思考，探索解帧、协作白板、健康助手与映界。',
  /** 站点地址 */
  url: 'https://luen0511.com',
  /** Hero 区域文案 */
  hero: {
    /** 主标题 */
    title: 'Luen0511',
    /** 副标题 */
    subtitle: 'Personal Server',
    /** 简短介绍 */
    description: 'A small corner of the Internet.'
  },
  /** 区块标题文案 */
  sections: {
    /** Featured 区块标题 */
    featured: 'Featured',
    /** mixed 布局下，列表类服务的区块标题 */
    otherServices: 'Other Services'
  },
  /** 页脚文案 */
  footer: {
    /** 版权主体 */
    copyright: 'Luen0511',
    /** 版权年份 */
    year: 2026,
    /** 构建说明文字 */
    builtWith: 'Built with Astro',
    /** 构建说明链接 */
    builtWithUrl: 'https://astro.build'
  }
} as const;
