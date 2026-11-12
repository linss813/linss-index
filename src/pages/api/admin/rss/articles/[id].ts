import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../../lib/db';
import { getSessionAdmin, logAction } from '../../../../../lib/auth';

const input = z.object({ visible: z.boolean().optional(), pinned: z.boolean().optional(), pinOrder: z.number().int().min(0).max(9999).optional() });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const idOf = (raw: string | undefined) => raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;

export const PUT: APIRoute = async ({ params, request, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const id = idOf(params.id); if (!id) return json({ error: '文章 ID 非法' }, 400);
  const existing = db.select().from(schema.rssArticles).where(eq(schema.rssArticles.id, id)).get();
  if (!existing) return json({ error: '文章不存在' }, 404);
  let body: unknown; try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const parsed = input.safeParse(body); if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (parsed.data.visible !== undefined) values.visible = parsed.data.visible ? 1 : 0;
  if (parsed.data.pinned !== undefined) values.pinned = parsed.data.pinned ? 1 : 0;
  if (parsed.data.pinOrder !== undefined) values.pinOrder = parsed.data.pinOrder;
  db.update(schema.rssArticles).set(values).where(eq(schema.rssArticles.id, id)).run();
  logAction('update', 'rss_article', id, JSON.stringify(parsed.data), clientAddress);
  return json({ success: true });
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const id = idOf(params.id); if (!id) return json({ error: '文章 ID 非法' }, 400);
  const existing = db.select().from(schema.rssArticles).where(eq(schema.rssArticles.id, id)).get();
  if (!existing) return json({ error: '文章不存在' }, 404);
  db.delete(schema.rssArticles).where(eq(schema.rssArticles.id, id)).run();
  logAction('delete', 'rss_article', id, existing.title, clientAddress);
  return json({ success: true });
};

