import type { APIRoute } from 'astro';
import { sqlite } from '../../lib/db';
import { initCommunity, canReplyTo } from '../../services/community';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
const attempts = new Map<string, number>();
export const POST: APIRoute = async (ctx) => {
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  if (ctx.request.headers.get('origin') !== ctx.url.origin)
    return json({ error: '请求来源无效' }, 403);
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: '无效请求' }, 400);
  }
  const p = z
    .object({
      name: z.string().trim().min(1).max(50),
      content: z.string().trim().min(1).max(2000),
      articleId: z.number().int().positive().nullable(),
      momentId: z.number().int().positive().nullable().optional(),
      email: z.union([z.literal(''), z.email().max(254)]).optional(),
      website: z
        .union([
          z.literal(''),
          z
            .url()
            .max(1000)
            .refine((v) => /^https?:\/\//.test(v)),
        ])
        .optional(),
      parentId: z.number().int().positive().nullable().optional(),
    })
    .safeParse(body);
  if (!p.success) return json({ error: '请填写昵称和留言（最多2000字）' }, 400);
  const ip = ctx.clientAddress;
  const now = Date.now();
  if (now - (attempts.get(ip) || 0) < 60000)
    return json({ error: '请稍后再留言' }, 429);
  if (attempts.size > 10000)
    for (const [key, time] of attempts)
      if (now - time > 60000) attempts.delete(key);
  const v = p.data;
  if (
    v.articleId &&
    !sqlite
      .prepare(
        'SELECT id FROM rss_articles WHERE id=? AND visible=1 AND deleted_at IS NULL',
      )
      .get(v.articleId)
  )
    return json({ error: '文章不存在' }, 404);
  if (
    v.momentId &&
    (v.articleId ||
      !sqlite
        .prepare(
          'SELECT id FROM moments WHERE id=? AND visible=1 AND deleted_at IS NULL',
        )
        .get(v.momentId))
  )
    return json({ error: '动态不存在' }, 404);
  initCommunity();
  if (v.parentId && !canReplyTo(v.parentId, v.articleId, v.momentId || null))
    return json({ error: '回复的留言不存在或尚未公开' }, 400);
  if (
    sqlite
      .prepare(
        "SELECT id FROM comments WHERE article_id IS ? AND moment_id IS ? AND name=? AND content=? AND created_at>datetime('now','-1 day')",
      )
      .get(v.articleId, v.momentId || null, v.name, v.content)
  )
    return json({ error: '这条留言已经提交，请等待审核' }, 409);
  sqlite
    .prepare(
      'INSERT INTO comments(article_id,moment_id,name,content,email,website,avatar,parent_id) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      v.articleId,
      v.momentId || null,
      v.name,
      v.content,
      v.email || '',
      v.website || '',
      randomBytes(8).toString('hex'),
      v.parentId || null,
    );
  attempts.set(ip, now);
  return json({ success: true, message: '留言已提交，审核后展示' });
};
