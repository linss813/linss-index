/**
 * 数据库 Schema 定义
 * 使用 Drizzle ORM 定义 SQLite 表结构
 * 所有表通过 Migration 创建，禁止运行时自动建表
 */
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/** 当前时间戳 SQL 表达式（UTC ISO 字符串） */
const now = sql`(datetime('now'))`;

/* =========================================
 * 1. admins — 管理员
 * ========================================= */
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
  lastLoginAt: text('last_login_at'),
});

/* =========================================
 * 2. settings — 网站基础配置（key-value）
 * ========================================= */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 3. services — 服务列表
 * ========================================= */
export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  url: text('url').notNull(),
  icon: text('icon').notNull().default('server'),
  category: text('category').notNull().default(''),
  /** 显示方式：featured / card / list（兼容 V1） */
  display: text('display').notNull().default('card'),
  /** 兼容字段：等价于 display='featured' */
  featured: integer('featured').notNull().default(0),
  /** 是否新窗口打开 */
  external: integer('external').notNull().default(0),
  /** 排序值 */
  sortOrder: integer('sort_order').notNull().default(0),
  /** 是否启用 */
  enabled: integer('enabled').notNull().default(1),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 4. navigation — 导航链接（统一 Header/Quick/Footer）
 * ========================================= */
export const navigation = sqliteTable('navigation', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  icon: text('icon'),
  /** 位置：header / quick / footer */
  location: text('location').notNull().default('footer'),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  /** 是否新窗口打开 */
  external: integer('external').notNull().default(0),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 5. projects — 项目管理
 * ========================================= */
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** 封面图路径 */
  cover: text('cover'),
  /** 技术栈（逗号分隔） */
  techStack: text('tech_stack'),
  githubUrl: text('github_url'),
  demoUrl: text('demo_url'),
  /** 状态：active / archived / draft */
  status: text('status').notNull().default('active'),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 6. home_sections — 首页区块控制
 * ========================================= */
export const homeSections = sqliteTable('home_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 区块类型：hero / featured / services / projects / blog / footer */
  type: text('type').notNull().unique(),
  title: text('title'),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  /** 区块附加配置（JSON 字符串） */
  config: text('config'),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 7. themes — 主题色板
 * ========================================= */
export const themes = sqliteTable('themes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  /** 主题色板配置（JSON：{ light: {...}, dark: {...} }） */
  configJson: text('config_json').notNull().default('{}'),
  enabled: integer('enabled').notNull().default(1),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 8. wallpapers — 壁纸
 * ========================================= */
export const wallpapers = sqliteTable('wallpapers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  /** 访问 URL 路径 */
  url: text('url').notNull(),
  mimeType: text('mime_type').notNull().default('image/jpeg'),
  /** 文件大小（字节） */
  size: integer('size').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  createdAt: text('created_at').notNull().default(now),
});

/* =========================================
 * 9. seo — SEO 配置（key-value）
 * ========================================= */
export const seo = sqliteTable('seo', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 10. admin_logs — 管理员操作日志
 * ========================================= */
export const adminLogs = sqliteTable('admin_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 操作类型：login / update / create / delete / upload */
  action: text('action').notNull(),
  /** 操作目标：settings / services / navigation / projects / themes / wallpapers / seo */
  target: text('target'),
  /** 目标 ID */
  targetId: integer('target_id'),
  /** 操作详情（JSON 或文字描述，不含敏感信息） */
  detail: text('detail'),
  /** 请求 IP */
  ip: text('ip'),
  createdAt: text('created_at').notNull().default(now),
});

/* =========================================
 * 11. gallery_photos — 相册照片
 * ========================================= */
export const galleryPhotos = sqliteTable('gallery_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 图片标题（可空） */
  title: text('title'),
  /** 图片描述（可空） */
  description: text('description'),
  /** 原图地址（相对路径或完整 HTTPS URL） */
  image: text('image').notNull(),
  /** 缩略图地址（可空，未提供时列表直接用原图） */
  thumbnail: text('thumbnail'),
  /** 所属相册（可空 = 未分组） */
  albumId: integer('album_id'),
  /** 分类（可空） */
  category: text('category'),
  /** 展示日期（如 2026-08-01，可空） */
  date: text('date'),
  /** 原图宽度（px，可空：URL 建档时未知） */
  width: integer('width'),
  /** 原图高度（px，可空） */
  height: integer('height'),
  /** 文件大小（字节，可空） */
  fileSize: integer('file_size'),
  /** MIME 类型（可空） */
  mimeType: text('mime_type'),
  /** EXIF 元数据 JSON 字符串（可空，GPS 等敏感字段仅在公开配置允许时下发） */
  metadata: text('metadata'),
  /** EXIF 拍摄时间（UTC ISO 字符串，可空） */
  takenAt: text('taken_at'),
  /** 是否添加水印（1 = 前台展示水印版本，0 = 原图直出） */
  watermarked: integer('watermarked').notNull().default(0),
  /** 排序值（越小越靠前） */
  sortOrder: integer('sort_order').notNull().default(0),
  /** 是否公开展示 */
  published: integer('published').notNull().default(1),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 12. gallery_albums — 相册分组
 * ========================================= */
export const galleryAlbums = sqliteTable('gallery_albums', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 相册名称 */
  name: text('name').notNull(),
  /** 相册描述（可空） */
  description: text('description'),
  /** 封面图地址（可空，未设置时取相册内第一张缩略图） */
  cover: text('cover'),
  /** 排序值（越小越靠前） */
  sortOrder: integer('sort_order').notNull().default(0),
  /** 是否公开 */
  published: integer('published').notNull().default(1),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 13. rss_categories — RSS 来源分类
 * ========================================= */
export const rssCategories = sqliteTable('rss_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/* =========================================
 * 14. rss_sources — RSS / Atom 订阅源
 * ========================================= */
export const rssSources = sqliteTable(
  'rss_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    rssUrl: text('rss_url').notNull().unique(),
    siteUrl: text('site_url'),
    sitemapUrl: text('sitemap_url'),
    description: text('description').notNull().default(''),
    icon: text('icon'),
    cover: text('cover'),
    categoryId: integer('category_id').references(() => rssCategories.id, {
      onDelete: 'set null',
    }),
    /** 展示类型：primary 主 RSS / secondary 次 RSS */
    displayType: text('display_type').notNull().default('secondary'),
    sortOrder: integer('sort_order').notNull().default(0),
    enabled: integer('enabled').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    index('idx_rss_sources_enabled').on(table.enabled),
    index('idx_rss_sources_category').on(table.categoryId),
    index('idx_rss_sources_display').on(table.displayType),
  ],
);

/* =========================================
 * 15. rss_articles — RSS 同步文章（长期保留）
 * ========================================= */
export const rssArticles = sqliteTable(
  'rss_articles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('source_id').references(() => rssSources.id, {
      onDelete: 'set null',
    }),
    /** 来源快照：即使来源被删除，文章仍能明确标注出处。 */
    sourceName: text('source_name').notNull(),
    sourceSiteUrl: text('source_site_url'),
    guid: text('guid').notNull(),
    slug: text('slug').notNull(),
    originalUrl: text('original_url').notNull(),
    title: text('title').notNull(),
    author: text('author'),
    summary: text('summary').notNull().default(''),
    contentHtml: text('content_html').notNull().default(''),
    contentMarkdown: text('content_markdown'),
    contentJson: text('content_json'),
    saveVersion: integer('save_version').notNull().default(0),
    deletedAt: text('deleted_at'),
    contentText: text('content_text').notNull().default(''),
    coverUrl: text('cover_url'),
    categoriesJson: text('categories_json').notNull().default('[]'),
    tagsJson: text('tags_json').notNull().default('[]'),
    publishedAt: text('published_at'),
    sourceUpdatedAt: text('source_updated_at'),
    contentHash: text('content_hash').notNull(),
    syncedAt: text('synced_at').notNull().default(now),
    visible: integer('visible').notNull().default(1),
    pinned: integer('pinned').notNull().default(0),
    pinOrder: integer('pin_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('uidx_rss_articles_url').on(table.originalUrl),
    uniqueIndex('uidx_rss_articles_slug').on(table.slug),
    uniqueIndex('uidx_rss_articles_source_guid').on(table.sourceId, table.guid),
    index('idx_rss_articles_source').on(table.sourceId),
    index('idx_rss_articles_visible_date').on(table.visible, table.publishedAt),
    index('idx_rss_articles_pinned').on(
      table.visible,
      table.pinned,
      table.pinOrder,
    ),
  ],
);

/* =========================================
 * 类型导出（供 Service 层使用）
 * ========================================= */
export type Admin = typeof admins.$inferSelect;
export type AdminInsert = typeof admins.$inferInsert;
export type Service = typeof services.$inferSelect;
export type ServiceInsert = typeof services.$inferInsert;
export type NavItem = typeof navigation.$inferSelect;
export type NavInsert = typeof navigation.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;
export type HomeSection = typeof homeSections.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type ThemeInsert = typeof themes.$inferInsert;
export type Wallpaper = typeof wallpapers.$inferSelect;
export type WallpaperInsert = typeof wallpapers.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type SeoItem = typeof seo.$inferSelect;
export type AdminLog = typeof adminLogs.$inferSelect;
export type GalleryPhoto = typeof galleryPhotos.$inferSelect;
export type GalleryPhotoInsert = typeof galleryPhotos.$inferInsert;
export type GalleryAlbum = typeof galleryAlbums.$inferSelect;
export type GalleryAlbumInsert = typeof galleryAlbums.$inferInsert;
export type RssCategory = typeof rssCategories.$inferSelect;
export type RssCategoryInsert = typeof rssCategories.$inferInsert;
export type RssSource = typeof rssSources.$inferSelect;
export type RssSourceInsert = typeof rssSources.$inferInsert;
export type RssArticle = typeof rssArticles.$inferSelect;
export type RssArticleInsert = typeof rssArticles.$inferInsert;
