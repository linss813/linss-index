/**
 * 服务显示方式：
 * - 'featured'：Featured 重点区大卡片
 * - 'card'：分类分组卡片网格
 * - 'list'：列表行（mixed 布局下进入 Other Services 区块）
 */
export type ServiceDisplay = 'card' | 'list' | 'featured';

/**
 * 服务接口定义
 */
export interface Service {
  /** 服务名称 */
  name: string;
  /** 服务描述 */
  description: string;
  /** 服务地址 */
  url: string;
  /** 图标名称（可用图标见 src/components/Icon.astro） */
  icon?: string;
  /** 所属分类（相同分类会归入同一分组展示） */
  category: string;
  /** 显示方式（未设置时：featured 为 true 视为 'featured'，否则 'card'） */
  display?: ServiceDisplay;
  /** 兼容字段：等价于 display: 'featured'（display 存在时优先） */
  featured?: boolean;
  /** 是否为新窗口打开的外部链接 */
  external?: boolean;
}

/** 本次新增入口也用于已有数据库的一次性补充。 */
export const portalLinks: Service[] = [
  { name: '解帧 Frame', description: '粘贴分享链接，预览图片与视频，选择规格并保存到设备。', url: 'https://frame.luen0511.com', icon: 'image', category: 'Tools', display: 'card', external: true },
  { name: '健康助手', description: '记录体重、饮水、饮食与运动，整理个人和家庭的健康日常。', url: 'https://jz.luen0511.com', icon: 'activity', category: 'Personal', display: 'card', external: true },
  { name: 'Pinboard 协作白板', description: '用便签、图片和画笔整理想法，分享房间链接，与伙伴实时协作。', url: 'https://pinboard.luen0511.com', icon: 'book-open', category: 'Tools', display: 'card', external: true },
  { name: '映界 CineAtlas', description: '聚合影视来源与片名搜索，管理收藏和观看进度，便捷切换播放线路。', url: 'https://video.luen0511.com', icon: 'video', category: 'Entertainment', display: 'card', external: true },
  { name: 'Sitemap', description: '站点地图 · 浏览本站公开页面索引', url: '/sitemap.xml', icon: 'globe', category: 'Tools', display: 'list', external: false },
];

/**
 * 服务列表配置
 * 新增 / 删除服务时只需修改此数组，无需改动页面组件；
 * 某个分类下没有服务时，该分类分组自动隐藏
 */
export const services: Service[] = [
  ...portalLinks,
  {
    name: 'Blog',
    description: '我的个人博客',
    url: 'https://blog.luen0511.com',
    icon: 'book-open',
    category: 'Personal',
    display: 'featured',
    external: false
  },
  {
    name: 'Files',
    description: '个人文件服务',
    url: 'https://files.luen0511.com',
    icon: 'folder',
    category: 'Tools',
    display: 'featured',
    external: false
  },
  {
    name: 'Meet',
    description: '在线会议服务',
    url: 'https://meet.luen0511.com',
    icon: 'video',
    category: 'Tools',
    display: 'list',
    external: false
  },
  // ↓ 以下为分组 / 显示方式效果示例，可按需删除或替换 ↓
  {
    name: 'Player',
    description: '自建音乐播放服务',
    url: 'https://music.luen0511.com',
    icon: 'music',
    category: 'Entertainment',
    display: 'card',
    external: false
  },
  {
    name: 'Lab',
    description: '实验性小项目合集',
    url: 'https://lab.luen0511.com',
    icon: 'flask-conical',
    category: 'Projects',
    display: 'list',
    external: false
  }
];
