import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../../lib/db';
import { getSessionAdmin, logAction } from '../../../../../lib/auth';

const input = z.object({ name: z.string().trim().min(1).max(40).optional(), sortOrder: z.number().int().optional() });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const idOf = (raw: string | undefined) => raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;

export const PUT: APIRoute = async ({ params, request, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const id = idOf(params.id);
  if (!id) return json({ error: '分类 ID 非法' }, 400);
  const existing = db.select().from(schema.rssCategories).where(eq(schema.rssCategories.id, id)).get();
  if (!existing) return json({ error: '分类不存在' }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const parsed = input.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  try {
    db.update(schema.rssCategories).set({ ...parsed.data, updatedAt: new Date().toISOString() }).where(eq(schema.rssCategories.id, id)).run();
  } catch { return json({ error: '分类名称已存在' }, 409); }
  logAction('update', 'rss_category', id, parsed.data.name ?? existing.name, clientAddress);
  return json({ success: true });
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const id = idOf(params.id);
  if (!id) return json({ error: '分类 ID 非法' }, 400);
  const existing = db.select().from(schema.rssCategories).where(eq(schema.rssCategories.id, id)).get();
  if (!existing) return json({ error: '分类不存在' }, 404);
  db.transaction((tx) => {
    tx.update(schema.rssSources).set({ categoryId: null }).where(eq(schema.rssSources.categoryId, id)).run();
    tx.delete(schema.rssCategories).where(eq(schema.rssCategories.id, id)).run();
  });
  logAction('delete', 'rss_category', id, existing.name, clientAddress);
  return json({ success: true });
};

