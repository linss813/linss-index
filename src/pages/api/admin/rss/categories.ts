import type { APIRoute } from 'astro';
import { z } from 'zod';
import { asc } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { getSessionAdmin, logAction } from '../../../../lib/auth';

const schemaInput = z.object({ name: z.string().trim().min(1, '分类名称不能为空').max(40), sortOrder: z.number().int().default(0) });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ session }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  return json(db.select().from(schema.rssCategories).orderBy(asc(schema.rssCategories.sortOrder), asc(schema.rssCategories.id)).all());
};

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const parsed = schemaInput.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  try {
    const created = db.insert(schema.rssCategories).values(parsed.data).returning().get();
    logAction('create', 'rss_category', created.id, created.name, clientAddress);
    return json(created, 201);
  } catch { return json({ error: '分类名称已存在' }, 409); }
};

