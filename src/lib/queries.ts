/**
 * 数据查询服务层
 * 所有前台组件通过此模块读取数据库数据
 * V1 配置文件作为默认值/回退使用，不直接被组件引用
 */
import { db, schema } from './db';
import { eq, asc, and } from 'drizzle-orm';
import { siteConfig } from '../config/site';
import { themes as v1Themes } from '../config/theme';
import { appearance as v1Appearance } from '../config/appearance';
import type { Service as DbService, NavItem, Project, HomeSection } from '../db/schema';
import type { Service as V1Service, ServiceDisplay } from '../config/services';
import type { QuickLink } from '../config/links';
import { parseAppearance, parseThemeDefinition } from './config-validation';

/* ---------- 简单内存缓存 ---------- */
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5_000; // 5 秒缓存

/** 读取缓存（未命中返回 null） */
function getCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return hit.data as T;
  }
  return null;
}

/** 写入缓存 */
function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

/** 清除全部缓存（后台修改数据后调用） */
export function clearCache(): void {
  cache.clear();
}

/* ---------- Settings ---------- */

/** 获取全部设置项（key-value 映射） */
export function getAllSettings(): Record<string, string> {
  const cached = getCache<Record<string, string>>('settings');
  if (cached) return cached;

  const rows = db.select().from(schema.settings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  setCache('settings', result);
  return result;
}

/** 获取单个设置项 */
export function getSetting(key: string, fallback: string = ''): string {
  const settings = getAllSettings();
  return settings[key] ?? fallback;
}

/* ---------- 站点配置（合并 DB + V1 默认值） ---------- */

/** 获取站点配置（DB 覆盖 V1 默认值） */
export function getSiteConfig() {
  const settings = getAllSettings();
  const configuredYear = Number.parseInt(settings['footer_year'] ?? '', 10);
  const configuredUrl = settings['site_url'];
  const siteUrl = configuredUrl && /^https?:\/\//i.test(configuredUrl)
    ? configuredUrl
    : siteConfig.url;
  return {
    name: settings['site_name'] ?? siteConfig.name,
    title: settings['site_title'] ?? siteConfig.title,
    description: settings['site_description'] ?? siteConfig.description,
    url: siteUrl,
    hero: {
      title: settings['hero_title'] ?? siteConfig.hero.title,
      subtitle: settings['hero_subtitle'] ?? siteConfig.hero.subtitle,
      description: settings['hero_description'] ?? siteConfig.hero.description,
    },
    sections: {
      featured: settings['section_featured_title'] ?? siteConfig.sections.featured,
      otherServices: settings['section_other_title'] ?? siteConfig.sections.otherServices,
    },
    footer: {
      copyright: settings['footer_copyright'] ?? siteConfig.footer.copyright,
      year: Number.isInteger(configuredYear) ? configuredYear : siteConfig.footer.year,
      builtWith: settings['footer_built_with'] ?? siteConfig.footer.builtWith,
      builtWithUrl: settings['footer_built_with_url'] ?? siteConfig.footer.builtWithUrl,
    },
  };
}

/* ---------- Services ---------- */

/** 将数据库行转换为 V1 兼容的 Service 类型（boolean 替代 0/1） */
function toService(row: DbService): V1Service {
  return {
    name: row.name,
    description: row.description,
    url: row.url,
    icon: row.icon,
    category: row.category,
    display: row.display as ServiceDisplay,
    featured: row.featured === 1,
    external: row.external === 1,
  };
}

/** 获取所有已启用的服务（按 sort_order 排序） */
export function getServices(): V1Service[] {
  const cached = getCache<V1Service[]>('services');
  if (cached) return cached;

  const rows = db.select().from(schema.services)
    .where(eq(schema.services.enabled, 1))
    .orderBy(asc(schema.services.sortOrder))
    .all();
  const result = rows.map(toService);
  setCache('services', result);
  return result;
}

/* ---------- Navigation ---------- */

/** 将数据库行转换为 V1 兼容的 QuickLink 类型 */
function toQuickLink(row: NavItem): QuickLink {
  return {
    name: row.name,
    url: row.url,
    icon: row.icon ?? undefined,
    external: row.external === 1,
  };
}

/** 获取指定位置的导航链接（已启用，按 sort_order 排序） */
export function getNavigation(location: 'header' | 'quick' | 'footer'): QuickLink[] {
  const cacheKey = `nav_${location}`;
  const cached = getCache<QuickLink[]>(cacheKey);
  if (cached) return cached;

  const rows = db.select().from(schema.navigation)
    .where(and(eq(schema.navigation.enabled, 1), eq(schema.navigation.location, location)))
    .orderBy(asc(schema.navigation.sortOrder))
    .all();
  const result = rows.map(toQuickLink);
  setCache(cacheKey, result);
  return result;
}

/** 获取 GitHub URL */
export function getGithubUrl(): string {
  return getSetting('github_url', 'https://github.com');
}

/* ---------- Themes ---------- */

/** 获取当前激活的主题色板配置 */
export function getActiveTheme(): { name: string; config: typeof v1Themes.default } {
  const activeName = getSetting('active_theme', v1Appearance.theme);

  const cached = getCache<{ name: string; config: typeof v1Themes.default }>('active_theme');
  if (cached) return cached;

  const themeRow = db.select().from(schema.themes)
    .where(eq(schema.themes.name, activeName))
    .get();

  let config: typeof v1Themes.default;
  let name: string;

  const parsedTheme = themeRow ? parseThemeDefinition(themeRow.configJson) : null;
  if (themeRow && parsedTheme) {
    config = parsedTheme;
    name = themeRow.name;
  } else {
    // 主题 JSON 损坏或主题不存在时回退到内置配置，避免拖垮所有前台页面
    const fallbackKey = (activeName in v1Themes) ? activeName : 'default';
    config = v1Themes[fallbackKey as keyof typeof v1Themes];
    name = fallbackKey;
  }

  const result = { name, config };
  setCache('active_theme', result);
  return result;
}

/* ---------- Appearance ---------- */

/** 获取外观配置（从 settings 表读取 JSON） */
export function getAppearance() {
  const appearanceJson = getSetting('appearance', JSON.stringify(v1Appearance));
  return parseAppearance(appearanceJson);
}

/* ---------- SEO ---------- */

/** 获取 SEO 配置（key-value 映射） */
export function getSeo(): Record<string, string> {
  const cached = getCache<Record<string, string>>('seo');
  if (cached) return cached;

  const rows = db.select().from(schema.seo).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  setCache('seo', result);
  return result;
}

/* ---------- Home Sections ---------- */

/** 获取已启用的首页区块（按 sort_order 排序） */
export function getHomeSections(): HomeSection[] {
  const cached = getCache<HomeSection[]>('home_sections');
  if (cached) return cached;

  const rows = db.select().from(schema.homeSections)
    .where(eq(schema.homeSections.enabled, 1))
    .orderBy(asc(schema.homeSections.sortOrder))
    .all();
  setCache('home_sections', rows);
  return rows;
}

/* ---------- Projects ---------- */

/** 获取已启用的项目（按 sort_order 排序） */
export function getProjects(): Project[] {
  const cached = getCache<Project[]>('projects');
  if (cached) return cached;

  const rows = db.select().from(schema.projects)
    .where(eq(schema.projects.enabled, 1))
    .orderBy(asc(schema.projects.sortOrder))
    .all();
  setCache('projects', rows);
  return rows;
}
