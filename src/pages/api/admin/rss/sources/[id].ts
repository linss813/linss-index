import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../../lib/db';
import { getSessionAdmin, logAction } from '../../../../../lib/auth';
import { urlSchema } from '../../../../../lib/validation';

const optionalUrl = z.union([z.literal(''), urlSchema]).transform((value) => value || null);
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(), rssUrl: urlSchema.optional(),
  siteUrl: optionalUrl.optional(), sitemapUrl: optionalUrl.optional(),
  description: z.string().trim().max(500).optional(), icon: optionalUrl.optional(), cover: optionalUrl.optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  displayType: z.enum(['primary', 'secondary']).optional(), sortOrder: z.number().int().optional(), enabled: z.boolean().optional(),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const idOf = (raw: string | undefined) => raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;

export const PUT: APIRoute = async ({ params, request, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const id = idOf(params.id);
  if (!id) return json({ error: 'RSS 源 ID 非法' }, 400);
  const existing = db.select().from(schema.rssSources).where(eq(schema.rssSources.id, id)).get();
  if (!existing) return json({ error: 'RSS 源不存在' }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  const d = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ['name', 'rssUrl', 'siteUrl', 'sitemapUrl', 'description', 'icon', 'cover', 'categoryId', 'displayType', 'sortOrder'] as const) {
    if (d[key] !== undefined) updates[key] = d[key];
  }
  if (d.enabled !== undefined) updates.enabled = d.enabled ? 1 : 0;
  try {
    db.transaction((tx) => {
      if (d.displayType === 'primary') tx.update(schema.rssSources).set({ displayType: 'secondary' }).where(eq(schema.rssSources.displayType, 'primary')).run();
      tx.update(schema.rssSources).set(updates).where(eq(schema.rssSources.id, id)).run();
    });
  } catch (error) {
    return json({ error: String(error).includes('UNIQUE') ? 'RSS 地址已存在' : '更新 RSS 源失败' }, 409);
  }
  logAction('update', 'rss_source', id, d.name ?? existing.name, clientAddress);
  return json({ success: true });
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const id = idOf(params.id);
  if (!id) return json({ error: 'RSS 源 ID 非法' }, 400);
  const existing = db.select().from(schema.rssSources).where(eq(schema.rssSources.id, id)).get();
  if (!existing) return json({ error: 'RSS 源不存在' }, 404);
  db.delete(schema.rssSources).where(eq(schema.rssSources.id, id)).run();
  logAction('delete', 'rss_source', id, existing.name, clientAddress);
  return json({ success: true });
};

