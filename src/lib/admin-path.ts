/**
 * 后台访问路径（Admin Base Path）管理
 * 后台路径不再硬编码为 /admin，而是可在后台「安全设置」中修改：
 * 中间件依据此路径做重写（/secret/* → 内部 /admin/*），并对旧路径返回 404，
 * 使扫描器无法通过默认路径发现后台入口。
 */
import { createHmac } from 'node:crypto';
import { db, schema } from './db';
import { eq } from 'drizzle-orm';
import { envConfig } from './env';

/** settings 表中存储后台路径的 key */
export const ADMIN_PATH_SETTING_KEY = 'admin_base_path';

/** 默认后台路径（未配置或配置非法时回退） */
export const DEFAULT_ADMIN_PATH = 'control-room';

/**
 * 保留字：禁止作为后台路径（与现有公开路由/资源冲突）
 * 当前默认路径允许使用（用于恢复默认路径）
 */
const RESERVED_PATHS = new Set([
  'api',
  'uploads',
  '_astro',
  'assets',
  'gallery',
  'fonts',
  'images',
  'static',
  'public',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'sitemap-index.xml',
  'blog',
  'tools',
  'moments',
  'services',
  'projects',
  'navigation',
  'themes',
  'wallpapers',
  'home',
]);

/** 合法路径格式：3-32 位小写字母/数字/连字符/下划线 */
const PATH_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;

/**
 * 校验并规范化后台路径输入
 * @param raw 用户输入的原始路径
 * @returns 校验结果：ok 时 value 为规范化路径，否则 error 为中文错误信息
 */
export function normalizeAdminPath(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = (raw ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  if (value === DEFAULT_ADMIN_PATH || value === 'admin')
    return { ok: true, value };
  if (!PATH_PATTERN.test(value)) {
    return {
      ok: false,
      error:
        '路径需为 3-32 位小写字母、数字、连字符或下划线，且以字母/数字开头',
    };
  }
  if (RESERVED_PATHS.has(value)) {
    return { ok: false, error: `「${value}」为系统保留路径，请更换` };
  }
  return { ok: true, value };
}

/**
 * 读取当前生效的后台路径（直接查库，better-sqlite3 同步调用开销可忽略）
 * 配置缺失或非法时回退默认 'admin'
 * @returns 不含前后斜杠的路径段，如 'admin' / 'secret-panel'
 */
export function getAdminBasePath(): string {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, ADMIN_PATH_SETTING_KEY))
    .get();
  if (!row?.value) return DEFAULT_ADMIN_PATH;
  const parsed = normalizeAdminPath(row.value);
  return parsed.ok ? parsed.value : DEFAULT_ADMIN_PATH;
}

/**
 * 拼接后台内部链接（供 .astro 页面服务端渲染导航使用）
 * @param subPath 后台内子路径，需以 / 开头，如 '/settings'；首页传 '' 或 '/'
 * @returns 完整公开路径，如 '/secret-panel/settings'
 */
export function adminUrl(subPath = ''): string {
  const base = getAdminBasePath();
  const rest = subPath.startsWith('/') ? subPath : `/${subPath}`;
  return `/${base}${rest === '/' ? '' : rest}`;
}

/**
 * 生成后台入口令牌（HMAC-SHA256）
 * 访问正确后台路径时下发 HttpOnly Cookie，隐藏 /api/admin/* 接口：
 * 扫描器直接请求 /api/admin/login 时无此令牌 → 404；
 * 令牌与当前路径 + 服务端 SESSION_SECRET 绑定，修改路径后旧令牌立即失效。
 * @param basePath 当前后台路径
 * @returns 十六进制摘要字符串
 */
export function adminEntryToken(basePath: string): string {
  return createHmac('sha256', envConfig.sessionSecret)
    .update(`admin-entry:${basePath}`)
    .digest('hex');
}

/**
 * 生成内部重写标记（HMAC-SHA256）
 * context.rewrite() 会二次执行中间件；携带此签名头表示请求来自服务端自身的重写，
 * 二次进入时直接放行。外部请求无法伪造（不掌握 SESSION_SECRET），故不能借此绕过鉴权。
 * @returns 十六进制签名串
 */
export function internalRewriteToken(): string {
  return createHmac('sha256', envConfig.sessionSecret)
    .update('linss-internal-rewrite')
    .digest('hex');
}
