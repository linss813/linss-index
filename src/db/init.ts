/**
 * 数据库初始化脚本
 * 首次运行时创建全部表，并从 V1 配置文件导入种子数据
 * 后续运行只补充缺失的设置项，不覆盖已有数据
 *
 * 使用方式：npx tsx src/db/init.ts
 */
import { sqlite, db, schema } from '../lib/db';
import { eq } from 'drizzle-orm';
import { envConfig } from '../lib/env';
import * as bcrypt from 'bcryptjs';
import { siteConfig } from '../config/site';
import { services as v1Services } from '../config/services';
import { quickLinks, footerLinks, githubUrl } from '../config/links';
import { themes as v1Themes } from '../config/theme';
import { appearance as v1Appearance } from '../config/appearance';
import { createTables } from './ddl';
import { enrichSeoDefaults } from './seo-defaults';
import { migratePortalLinks, enrichPortalLinks } from './portal-links';

/**
 * 创建全部数据库表（DDL 定义见 ./ddl.ts，与单元测试共用）
 */
function setupTables(): void {
  console.log('[init] 正在创建数据库表...');
  createTables(sqlite);
  console.log('[init] 数据库表创建完成');
}

/**
 * 创建默认管理员账号
 */
function seedAdmin(): void {
  const existing = db.select().from(schema.admins).all();
  if (existing.length > 0) {
    console.log('[seed] 管理员已存在，跳过');
    return;
  }

  const hash = bcrypt.hashSync(envConfig.adminInitialPassword, 10);
  db.insert(schema.admins).values({
    username: 'admin',
    passwordHash: hash,
  }).run();

  console.log(`[seed] 管理员创建成功（用户名: admin，密码: 环境变量 ADMIN_INITIAL_PASSWORD）`);
}

/**
 * 导入 V1 site.ts 配置到 settings 表
 */
function seedSettings(): void {
  const entries: { key: string; value: string }[] = [
    { key: 'site_name', value: siteConfig.name },
    { key: 'site_title', value: siteConfig.title },
    { key: 'site_description', value: siteConfig.description },
    { key: 'site_url', value: siteConfig.url },
    { key: 'hero_title', value: siteConfig.hero.title },
    { key: 'hero_subtitle', value: siteConfig.hero.subtitle },
    { key: 'hero_description', value: siteConfig.hero.description },
    { key: 'section_featured_title', value: siteConfig.sections.featured },
    { key: 'section_other_title', value: siteConfig.sections.otherServices },
    { key: 'footer_copyright', value: siteConfig.footer.copyright },
    { key: 'footer_year', value: String(siteConfig.footer.year) },
    { key: 'footer_built_with', value: siteConfig.footer.builtWith },
    { key: 'footer_built_with_url', value: siteConfig.footer.builtWithUrl },
    { key: 'github_url', value: githubUrl },
    // 外观配置（JSON 存储）
    { key: 'appearance', value: JSON.stringify(v1Appearance) },
    // 当前激活主题
    { key: 'active_theme', value: v1Appearance.theme },
    // 主题模式
    { key: 'theme_mode', value: v1Appearance.themeMode },
    // 布局模式
    { key: 'layout_mode', value: v1Appearance.layout.mode },
    // 博客列表与详情页在文章没有封面时使用的统一缺省图
    { key: 'blog_default_cover', value: '/images/blog-default-cover.svg' },
  ];

  for (const entry of entries) {
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, entry.key)).get();
    if (!existing) {
      db.insert(schema.settings).values(entry).run();
    }
  }

  console.log('[seed] 网站配置导入完成');
}

/**
 * 导入 V1 services.ts 到 services 表
 */
function seedServices(): void {
  const existing = db.select().from(schema.services).all();
  if (existing.length > 0) {
    console.log('[seed] 服务列表已有数据，跳过');
    return;
  }

  v1Services.forEach((s, i) => {
    db.insert(schema.services).values({
      name: s.name,
      description: s.description,
      url: s.url,
      icon: s.icon ?? 'server',
      category: s.category,
      display: s.display ?? (s.featured ? 'featured' : 'card'),
      featured: s.featured ? 1 : 0,
      external: s.external ? 1 : 0,
      sortOrder: i,
      enabled: 1,
    }).run();
  });

  console.log(`[seed] 服务列表导入完成（${v1Services.length} 条）`);
}

/**
 * 导入 V1 links.ts 到 navigation 表
 */
function seedNavigation(): void {
  const existing = db.select().from(schema.navigation).all();
  if (existing.length > 0) {
    console.log('[seed] 导航链接已有数据，跳过');
    return;
  }

  quickLinks.forEach((link, i) => {
    db.insert(schema.navigation).values({
      name: link.name,
      url: link.url,
      icon: link.icon ?? null,
      location: 'quick',
      sortOrder: i,
      enabled: 1,
      external: link.external ? 1 : 0,
    }).run();
  });

  footerLinks.forEach((link, i) => {
    db.insert(schema.navigation).values({
      name: link.name,
      url: link.url,
      icon: link.icon ?? null,
      location: 'footer',
      sortOrder: i,
      enabled: 1,
      external: link.external ? 1 : 0,
    }).run();
  });

  console.log(`[seed] 导航链接导入完成（quick: ${quickLinks.length}, footer: ${footerLinks.length}）`);
}

/**
 * 导入 V1 theme.ts 到 themes 表
 */
function seedThemes(): void {
  const existing = db.select().from(schema.themes).all();
  if (existing.length > 0) {
    console.log('[seed] 主题已有数据，跳过');
    return;
  }

  for (const [name, def] of Object.entries(v1Themes)) {
    db.insert(schema.themes).values({
      name,
      configJson: JSON.stringify(def),
      enabled: 1,
    }).run();
  }

  console.log(`[seed] 主题导入完成（${Object.keys(v1Themes).length} 套）`);
}

/**
 * 导入 V1 appearance.ts 背景配置到 wallpapers/home_sections
 */
function seedHomeSections(): void {
  const existing = db.select().from(schema.homeSections).all();
  if (existing.length > 0) {
    console.log('[seed] 首页区块已有数据，跳过');
    return;
  }

  const sections = [
    { type: 'hero', title: 'Hero', sortOrder: 1, enabled: 1 },
    { type: 'featured', title: 'Featured', sortOrder: 2, enabled: 1 },
    { type: 'services', title: 'Services', sortOrder: 3, enabled: 1 },
    { type: 'projects', title: 'Projects', sortOrder: 4, enabled: 1 },
    { type: 'footer', title: 'Footer', sortOrder: 5, enabled: 1 },
  ];

  for (const s of sections) {
    db.insert(schema.homeSections).values(s).run();
  }

  console.log(`[seed] 首页区块导入完成（${sections.length} 个）`);
}

/**
 * 导入默认 SEO 配置
 */
function seedSeo(): void {
  const entries: { key: string; value: string }[] = [
    { key: 'title', value: siteConfig.title },
    { key: 'description', value: siteConfig.description },
    { key: 'keywords', value: 'Luen0511, Personal Server, Blog' },
    { key: 'og_title', value: siteConfig.title },
    { key: 'og_description', value: siteConfig.description },
    { key: 'og_image', value: '' },
  ];

  for (const entry of entries) {
    const existing = db.select().from(schema.seo).where(eq(schema.seo.key, entry.key)).get();
    if (!existing) {
      db.insert(schema.seo).values(entry).run();
    }
  }

  console.log('[seed] SEO 配置导入完成');
}

/**
 * 幂等补充 Gallery 导航入口（location=quick，内部链接）
 * 无论导航表是否有其他数据，只要不存在 /gallery 入口就补一条，保证前台可达
 */
function ensureGalleryNav(): void {
  const existing = db
    .select()
    .from(schema.navigation)
    .where(eq(schema.navigation.url, '/gallery'))
    .get();
  if (existing) return;

  // 排序值取 quick 区当前最大值 + 1，追加在末尾
  const quickItems = db.select().from(schema.navigation).where(eq(schema.navigation.location, 'quick')).all();
  const maxOrder = quickItems.reduce((m, it) => Math.max(m, it.sortOrder), -1);

  db.insert(schema.navigation).values({
    name: 'Gallery',
    url: '/gallery',
    icon: null,
    location: 'quick',
    sortOrder: maxOrder + 1,
    enabled: 1,
    external: 0,
  }).run();

  console.log('[seed] Gallery 导航入口已补充（quick 区）');
}

/** 幂等创建 RSS 默认分类和当前博客主订阅源。 */
function seedRss(): void {
  const categoryNames = ['技术', '生活', '设计', '随笔', '资讯', '其他'];
  categoryNames.forEach((name, index) => {
    const existing = db.select().from(schema.rssCategories).where(eq(schema.rssCategories.name, name)).get();
    if (!existing) db.insert(schema.rssCategories).values({ name, sortOrder: index }).run();
  });

  const rssUrl = 'https://blog.luen0511.com/rss.xml';
  const existing = db.select().from(schema.rssSources).where(eq(schema.rssSources.rssUrl, rssUrl)).get();
  if (!existing) {
    db.insert(schema.rssSources).values({
      name: '十三月杂记',
      rssUrl,
      siteUrl: 'https://blog.luen0511.com',
      sitemapUrl: 'https://blog.luen0511.com/sitemap.xml',
      description: '当前网站的主要文章内容来源',
      icon: 'https://blog.luen0511.com/favicon.ico',
      displayType: 'primary',
      sortOrder: 0,
      enabled: 1,
    }).run();
  }
  console.log('[seed] RSS 默认分类与主订阅源已就绪');
}

/**
 * 主函数：执行全部初始化与种子数据导入
 */
function main(): void {
  console.log('========== Luen0511 Home V2 数据库初始化 ==========');
  console.log(`数据库路径: ${envConfig.databaseUrl}`);
  console.log('');

  setupTables();
  seedAdmin();
  seedSettings();
  seedServices();
  console.log(`[seed] 新增服务入口 ${migratePortalLinks(sqlite)} 条`);
  console.log(`[seed] 服务介绍更新 ${enrichPortalLinks(sqlite)} 条`);
  seedNavigation();
  ensureGalleryNav();
  seedRss();
  seedThemes();
  seedHomeSections();
  seedSeo();
  enrichSeoDefaults(sqlite);

  console.log('');
  console.log('========== 数据库初始化完成 ==========');
  sqlite.close();
}

main();
