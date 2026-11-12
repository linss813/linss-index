import type { APIRoute } from 'astro';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { db, schema } from '../../../../../lib/db';
import { getSessionAdmin, logAction } from '../../../../../lib/auth';
import { parseIdArray } from '../../../../../lib/validation';

const input = z.object({
  ids: z.array(z.union([z.number(), z.string()])),
  action: z.enum(['show', 'hide', 'pin', 'unpin', 'delete']),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: '请求格式错误' }, 400); }

  const parsed = input.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  const parsedIds = parseIdArray(parsed.data.ids);
  if (!parsedIds) return json({ error: 'ID 列表无效：需为非空的正整数数组（最多 100 项）' }, 400);
  const ids = [...new Set(parsedIds)];

  let affected = 0;
  if (parsed.data.action === 'delete') {
    affected = db.delete(schema.rssArticles).where(inArray(schema.rssArticles.id, ids)).run().changes;
  } else {
    const values: Partial<typeof schema.rssArticles.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (parsed.data.action === 'show') values.visible = 1;
    if (parsed.data.action === 'hide') values.visible = 0;
    if (parsed.data.action === 'pin') values.pinned = 1;
    if (parsed.data.action === 'unpin') values.pinned = 0;
    affected = db.update(schema.rssArticles).set(values).where(inArray(schema.rssArticles.id, ids)).run().changes;
  }

  logAction(
    parsed.data.action === 'delete' ? 'batch_delete' : 'batch_update',
    'rss_article',
    null,
    `action: ${parsed.data.action}, ids: ${ids.join(',')}, count: ${affected}`,
    clientAddress,
  );
  return json({ affected });
};
