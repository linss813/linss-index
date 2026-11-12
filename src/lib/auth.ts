/**
 * 认证与会话管理模块
 * 基于 Astro Session + bcryptjs 实现管理员认证
 * Session 使用 HttpOnly Cookie，服务端验证
 */
import * as bcrypt from 'bcryptjs';
import { db, schema } from './db';
import { eq } from 'drizzle-orm';
import type { APIContext } from 'astro';

/** 重新导出 clearCache（供 API 端点统一从 auth 模块导入） */
export { clearCache } from './queries';

/** Session 中存储的管理员信息 */
export interface SessionAdmin {
  id: number;
  username: string;
}

/**
 * 验证用户名密码，成功返回管理员信息
 * @param username 用户名
 * @param password 明文密码
 * @returns 管理员信息或 null
 */
export async function verifyCredentials(username: string, password: string): Promise<SessionAdmin | null> {
  const admin = db.select().from(schema.admins)
    .where(eq(schema.admins.username, username))
    .get();

  if (!admin) return null;

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return null;

  // 更新最后登录时间
  db.update(schema.admins)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(schema.admins.id, admin.id))
    .run();

  return { id: admin.id, username: admin.username };
}

/**
 * 在 Astro Session 中设置管理员登录状态
 * @param context Astro API 上下文
 * @param admin 管理员信息
 */
export async function setSession(context: APIContext, admin: SessionAdmin): Promise<void> {
  context.session?.set('admin', admin);
}

/**
 * 从 Astro Session 获取当前登录管理员
 * @param context Astro API 上下文
 * @returns 管理员信息或 null
 */
export async function getSessionAdmin(context: APIContext): Promise<SessionAdmin | null> {
  const admin = await context.session?.get('admin') as SessionAdmin | null | undefined;
  if (!admin) return null;
  const current = db.select({ id: schema.admins.id, username: schema.admins.username })
    .from(schema.admins).where(eq(schema.admins.id, admin.id)).get();
  if (!current) {
    await context.session?.destroy();
    return null;
  }
  return current;
}

/**
 * 销毁当前会话（登出）
 * @param context Astro API 上下文
 */
export async function destroySession(context: APIContext): Promise<void> {
  context.session?.destroy();
}

/**
 * 检查当前请求是否已认证
 * 用于中间件和 API 端点守卫
 */
export async function isAuthenticated(context: APIContext): Promise<boolean> {
  const admin = await getSessionAdmin(context);
  return admin !== null;
}

/**
 * 要求认证，未认证时返回 401（用于 API 端点）
 */
export async function requireAuth(context: APIContext): Promise<SessionAdmin | null> {
  const admin = await getSessionAdmin(context);
  if (!admin) {
    return null;
  }
  return admin;
}

/** 记录管理员操作日志 */
export function logAction(action: string, target: string | null, targetId: number | null, detail: string | null, ip: string | null): void {
  db.insert(schema.adminLogs).values({
    action,
    target,
    targetId,
    detail,
    ip,
  }).run();
}
