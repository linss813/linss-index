/**
 * 管理员列表 API
 * GET /api/admin/admins — 返回全部管理员列表（不包含 password_hash 字段）
 */
import type { APIRoute } from 'astro';
import { db, schema } from '../../../lib/db';
import { getSessionAdmin } from '../../../lib/auth';

/**
 * GET 处理：返回管理员列表
 * 仅返回 id、username、createdAt、updatedAt、lastLoginAt，不返回 password_hash
 * @param context Astro API 上下文，用于鉴权
 * @returns JSON 形式的管理员数组
 */
export const GET: APIRoute = async ({ session }) => {
  // 二次鉴权（中间件已做全局守卫，此处加固敏感接口）
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 显式选取字段，排除 passwordHash，避免密码哈希泄露
  const rows = db
    .select({
      id: schema.admins.id,
      username: schema.admins.username,
      createdAt: schema.admins.createdAt,
      updatedAt: schema.admins.updatedAt,
      lastLoginAt: schema.admins.lastLoginAt,
    })
    .from(schema.admins)
    .all();

  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json' },
  });
};
