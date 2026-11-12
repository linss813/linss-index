/**
 * 管理员单条管理 API
 * PUT /api/admin/admins/:id — 修改指定管理员密码
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { getSessionAdmin, logAction } from '../../../../lib/auth';

/** 修改密码请求体校验：password 不能为空且至少 6 位 */
const updateSchema = z.object({
  password: z.string().min(6, '密码至少 6 位'),
});

/**
 * PUT 处理：根据 id 修改指定管理员密码
 * @param request       请求对象，包含 JSON 正文 { password: string }
 * @param params        路由参数，包含 id
 * @param session       会话信息，用于鉴权
 * @param clientAddress 客户端 IP，用于日志记录
 * @returns JSON 形式的成功信息
 */
export const PUT: APIRoute = async ({ request, params, session, clientAddress }) => {
  // 鉴权校验
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 路由参数 id 解析
  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: '无效 ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 请求体解析与校验
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? '参数错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 使用 bcryptjs 加密新密码
  const passwordHash = bcrypt.hashSync(parsed.data.password, 10);

  // 更新 password_hash 与 updatedAt
  db.update(schema.admins)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(schema.admins.id, id))
    .run();

  // 记录操作日志（不记录密码明文）
  logAction('update', 'admins', id, 'password changed', clientAddress);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
