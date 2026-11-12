/**
 * Astro 全局中间件
 * 职责：
 * 1. 保护后台页面与 API（未登录 → 页面重定向登录页 / API 返回 401）
 * 2. 支持自定义后台路径：/secret/* 内部重写到 /admin/*，旧路径 /admin 在自定义后返回 404
 * 3. 隐藏 /api/admin/*：自定义路径后，无入口令牌（访问后台页面时下发的 HttpOnly Cookie）
 *    且无有效会话的请求一律 404，使扫描器无法直接发现登录接口
 * 4. /admin/index 兼容：重定向到后台首页（旧链接 404 修复）
 *
 * 注意：Astro 的 context.rewrite() 会以重写后的路径二次执行本中间件，
 * 因此重写请求携带内部标记头，二次进入时直接放行（首次进入已完成鉴权）。
 */
import { defineMiddleware } from 'astro:middleware';
import { timingSafeEqual } from 'node:crypto';
import { getSessionAdmin } from './lib/auth';
import { getAdminBasePath, adminUrl, adminEntryToken, internalRewriteToken } from './lib/admin-path';
import { startRssScheduler } from './lib/rss-scheduler';

/** 入口令牌 Cookie 名 */
const ENTRY_COOKIE = 'admin_entry';

/** 内部重写标记头名 */
const INTERNAL_HEADER = 'x-linss-internal-rewrite';
/** Astro 7 的 Request 重写在部分 Node 适配器中不会保留自定义 Header，补充一个签名查询参数作为内部标记。 */
const INTERNAL_QUERY = '__linss_internal';

/**
 * 恒定时间比较两个十六进制串（长度不等直接判否，不抛异常）
 * @param a 待比较值
 * @param b 期望值
 */
function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * 携带内部签名标记执行重写（二次进入中间件时据此放行）
 * @param context 中间件上下文
 * @param target 重写目标路径
 */
async function internalRewrite(context: Parameters<Parameters<typeof defineMiddleware>[0]>[0], target: string): Promise<Response> {
  const url = new URL(target, context.url);
  url.searchParams.set(INTERNAL_QUERY, internalRewriteToken());
  const req = new Request(url, context.request);
  req.headers.set(INTERNAL_HEADER, internalRewriteToken());
  return context.rewrite(req);
}

/**
 * 返回品牌化 404 响应（复用 /404 页面渲染，不暴露后台存在性）
 * @param context 中间件上下文
 */
async function notFoundResponse(context: Parameters<Parameters<typeof defineMiddleware>[0]>[0]): Promise<Response> {
  const page = await internalRewrite(context, '/404');
  return new Response(page.body, { status: 404, headers: page.headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  startRssScheduler();
  // 内部重写的二次进入：签名有效（仅服务端可生成）才直接放行；外部伪造的头因无 SESSION_SECRET 无法通过
  if (safeEqual(context.request.headers.get(INTERNAL_HEADER), internalRewriteToken()) || safeEqual(context.url.searchParams.get(INTERNAL_QUERY), internalRewriteToken())) {
    return next();
  }

  const { pathname } = context.url;
  const base = getAdminBasePath();
  // /admin 是历史入口；即使当前默认入口已改名，也必须把它视为旧地址并隐藏。
  const custom = base !== 'admin';
  const secretPrefix = `/${base}`;

  // 访问正确的后台入口路径时下发/续期入口令牌 Cookie（HttpOnly，同源请求自动携带）
  if (custom && (pathname === secretPrefix || pathname.startsWith(`${secretPrefix}/`))) {
    context.cookies.set(ENTRY_COOKIE, adminEntryToken(base), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60,
    });
  }

  // 自定义路径生效后：旧后台地址（页面 + API）一律 404，不暴露任何后台痕迹
  if (custom) {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return notFoundResponse(context);
    }
    if (pathname.startsWith('/api/admin')) {
      const entry = context.cookies.get(ENTRY_COOKIE)?.value;
      const hasEntry = safeEqual(entry, adminEntryToken(base));
      const admin = hasEntry ? null : await getSessionAdmin(context);
      if (!hasEntry && !admin) {
        return notFoundResponse(context);
      }
    }
  }

  // 计算「内部有效路径」：自定义路径命中时映射回 /admin/*
  let effective = pathname;
  let needsRewrite = false;
  if (custom && (pathname === secretPrefix || pathname.startsWith(`${secretPrefix}/`))) {
    effective = `/admin${pathname.slice(secretPrefix.length)}`;
    needsRewrite = true;
  }

  // /admin/index（含自定义路径下的 /<base>/index）统一重定向到后台首页
  if (effective === '/admin/index' || effective === '/admin/index/') {
    return context.redirect(adminUrl(''), 302);
  }

  // 公开端点：登录与登出不受认证保护
  const publicApi = effective === '/api/admin/login' || effective === '/api/admin/logout';
  // 保护后台页面（登录页本身除外）
  const isAdminPage = effective.startsWith('/admin') && effective !== '/admin/login';
  // 保护后台 API（登录/登出端点除外）
  const isAdminApi = effective.startsWith('/api/admin') && !publicApi;

  if (isAdminPage || isAdminApi) {
    const admin = await getSessionAdmin(context);
    if (!admin) {
      if (isAdminApi) {
        return new Response(JSON.stringify({ error: '未登录' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // 未登录页面请求重定向到当前生效路径下的登录页
      return context.redirect(adminUrl('/login'));
    }
  }

  return needsRewrite ? internalRewrite(context, effective) : next();
});
