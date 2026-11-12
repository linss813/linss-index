/**
 * Services 单条管理 API
 * PUT    /api/admin/services/:id  — 修改服务
 * DELETE /api/admin/services/:id  — 删除服务
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { urlSchema } from '../../../../lib/validation';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  url: urlSchema.optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  display: z.enum(['featured', 'card', 'list']).optional(),
  featured: z.boolean().optional(),
  external: z.boolean().optional(),
  sortOrder: z.number().optional(),
  enabled: z.boolean().optional(),
});

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
  if (d.description !== undefined) updateData.description = d.description;
  if (d.url !== undefined) updateData.url = d.url;
  if (d.icon !== undefined) updateData.icon = d.icon;
  if (d.category !== undefined) updateData.category = d.category;
  if (d.display !== undefined) updateData.display = d.display;
  if (d.featured !== undefined) updateData.featured = d.featured ? 1 : 0;
  if (d.external !== undefined) updateData.external = d.external ? 1 : 0;
  if (d.sortOrder !== undefined) updateData.sortOrder = d.sortOrder;
  if (d.enabled !== undefined) updateData.enabled = d.enabled ? 1 : 0;

  db.update(schema.services).set(updateData).where(eq(schema.services.id, id)).run();
  clearCache();
  logAction('update', 'services', id, JSON.stringify(d), clientAddress);

  const updated = db.select().from(schema.services).where(eq(schema.services.id, id)).get();
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: '无效 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  db.delete(schema.services).where(eq(schema.services.id, id)).run();
  clearCache();
  logAction('delete', 'services', id, null, clientAddress);

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
