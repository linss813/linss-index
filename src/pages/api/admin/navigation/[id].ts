/**
 * Navigation 单条管理 API
 * PUT    /api/admin/navigation/:id  — 修改导航项（支持部分更新）
 * DELETE /api/admin/navigation/:id  — 删除导航项
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { urlSchema } from '../../../../lib/validation';

/** 修改导航项的请求体校验：全部字段可选，支持部分更新 */
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  url: urlSchema.optional(),
  icon: z.string().optional(),
  location: z.enum(['header', 'quick', 'footer']).optional(),
  external: z.boolean().optional(),
  sortOrder: z.number().optional(),
  enabled: z.boolean().optional(),
});

/**
 * PUT 处理：根据 id 修改指定导航项
 * @param request       请求对象，包含 JSON 正文
 * @param params        路由参数，包含 id
 * @param session       会话信息，用于鉴权
 * @param clientAddress 客户端 IP，用于日志记录
 */
export const PUT: APIRoute = async ({ request, params, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: '无效 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? '参数错误' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const d = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (d.name !== undefined) updateData.name = d.name;
  if (d.url !== undefined) updateData.url = d.url;
  if (d.icon !== undefined) updateData.icon = d.icon;
  if (d.location !== undefined) updateData.location = d.location;
  if (d.external !== undefined) updateData.external = d.external ? 1 : 0;
  if (d.sortOrder !== undefined) updateData.sortOrder = d.sortOrder;
  if (d.enabled !== undefined) updateData.enabled = d.enabled ? 1 : 0;

  db.update(schema.navigation).set(updateData).where(eq(schema.navigation.id, id)).run();
  clearCache();
  logAction('update', 'navigation', id, JSON.stringify(d), clientAddress);

  const updated = db.select().from(schema.navigation).where(eq(schema.navigation.id, id)).get();
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

/**
 * DELETE 处理：根据 id 删除指定导航项
 * @param params        路由参数，包含 id
 * @param session       会话信息，用于鉴权
 * @param clientAddress 客户端 IP，用于日志记录
 */
export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: '无效 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  db.delete(schema.navigation).where(eq(schema.navigation.id, id)).run();
  clearCache();
  logAction('delete', 'navigation', id, null, clientAddress);

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
