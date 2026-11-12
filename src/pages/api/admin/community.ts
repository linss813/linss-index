import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/auth';
import { sqlite } from '../../../lib/db';
import {
  initCommunity,
  communitySettings,
  canReplyTo,
} from '../../../services/community';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
export const GET: APIRoute = async (ctx) => {
  if (!(await requireAuth(ctx))) return json({ error: '未登录' }, 401);
  const page = (key: string) =>
    Math.max(
      1,
      Math.min(100000, Math.floor(Number(ctx.url.searchParams.get(key)) || 1)),
    );
  const momentPage = page('momentPage'),
    commentPage = page('commentPage');
  const mf = ctx.url.searchParams.get('momentFilter');
  const cf = ctx.url.searchParams.get('commentFilter');
  const target = ctx.url.searchParams.get('target');
  const momentWhere =
    mf === 'trash'
      ? 'deleted_at IS NOT NULL'
      : `deleted_at IS NULL${mf === 'public' ? ' AND visible=1' : mf === 'draft' ? ' AND visible=0' : ''}`;
  const commentWhere = `deleted=0${cf === 'pending' ? ' AND approved=0 AND moderated=0' : cf === 'hidden' ? ' AND approved=0 AND moderated=1' : cf === 'public' ? ' AND approved=1' : ''}${target === 'article' ? ' AND article_id IS NOT NULL' : target === 'moment' ? ' AND moment_id IS NOT NULL' : target === 'guestbook' ? ' AND article_id IS NULL AND moment_id IS NULL' : ''}`;
  return json({
    moments: sqlite
      .prepare(
        `SELECT * FROM moments WHERE ${momentWhere} ORDER BY pinned DESC,id DESC LIMIT 20 OFFSET ?`,
      )
      .all((momentPage - 1) * 20),
    comments: sqlite
      .prepare(
        `SELECT * FROM comments WHERE ${commentWhere} ORDER BY id DESC LIMIT 20 OFFSET ?`,
      )
      .all((commentPage - 1) * 20),
    momentTotal: (
      sqlite
        .prepare(`SELECT count(*) n FROM moments WHERE ${momentWhere}`)
        .get() as { n: number }
    ).n,
    commentTotal: (
      sqlite
        .prepare(`SELECT count(*) n FROM comments WHERE ${commentWhere}`)
        .get() as { n: number }
    ).n,
    settings: communitySettings(),
  });
};
export const POST: APIRoute = async (ctx) => {
  if (!(await requireAuth(ctx))) return json({ error: '未登录' }, 401);
  if (
    ctx.request.headers.get('origin') &&
    ctx.request.headers.get('origin') !== ctx.url.origin
  )
    return json({ error: '请求来源无效' }, 403);
  initCommunity();
  let b;
  try {
    b = await ctx.request.json();
  } catch {
    return json({ error: '无效请求' }, 400);
  }
  if (b.action === 'batch') {
    const parsed = z
      .object({
        ids: z.array(z.number().int().positive()).min(1).max(100),
        operation: z.enum(['approve', 'hide']),
      })
      .safeParse(b);
    if (!parsed.success) return json({ error: '批量参数错误' }, 400);
    sqlite.transaction(() => {
      for (const id of parsed.data.ids)
        sqlite
          .prepare(
            'UPDATE comments SET approved=?,moderated=1 WHERE id=? AND deleted=0',
          )
          .run(Number(parsed.data.operation === 'approve'), id);
    })();
  } else if (b.action === 'settings') {
    const p = z
      .object({
        home: z.boolean(),
        blog: z.boolean(),
        limit: z.number().int().min(1).max(10),
      })
      .safeParse(b.settings);
    if (!p.success) return json({ error: '无效设置' }, 400);
    sqlite
      .prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run('community_display', JSON.stringify(p.data));
  } else if (b.action === 'moment') {
    const safeUrl = z
      .string()
      .max(1000)
      .refine((v) => !v || /^https?:\/\//.test(v) || /^\/(?!\/)/.test(v));
    const p = z
      .object({
        id: z.number().int().positive().optional(),
        content: z.string().trim().min(1).max(5000),
        visible: z.boolean(),
        images: z.array(safeUrl).max(9).default([]),
        link: safeUrl.default(''),
        tags: z.string().max(200).default(''),
        pinned: z.boolean().default(false),
      })
      .safeParse(b);
    if (!p.success)
      return json(
        { error: '动态需为1–5000字，最多9张图片，链接需为HTTP/S或站内路径' },
        400,
      );
    const v = p.data;
    if (v.id)
      sqlite
        .prepare(
          'UPDATE moments SET content=?,visible=?,images_json=?,link=?,tags=?,pinned=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
        )
        .run(
          v.content,
          Number(v.visible),
          JSON.stringify(v.images),
          v.link,
          v.tags,
          Number(v.pinned),
          v.id,
        );
    else
      sqlite
        .prepare(
          'INSERT INTO moments(content,visible,images_json,link,tags,pinned) VALUES(?,?,?,?,?,?)',
        )
        .run(
          v.content,
          Number(v.visible),
          JSON.stringify(v.images),
          v.link,
          v.tags,
          Number(v.pinned),
        );
  } else if (
    ['trash-moment', 'restore-moment'].includes(b.action) &&
    Number.isSafeInteger(b.id)
  ) {
    if (b.action === 'trash-moment')
      sqlite
        .prepare(
          'UPDATE moments SET deleted_at=CURRENT_TIMESTAMP,visible=0 WHERE id=?',
        )
        .run(b.id);
    else
      sqlite
        .prepare('UPDATE moments SET deleted_at=NULL,visible=0 WHERE id=?')
        .run(b.id);
  } else if (b.action === 'reply') {
    const p = z
      .object({
        id: z.number().int().positive(),
        content: z.string().trim().min(1).max(2000),
      })
      .safeParse(b);
    if (!p.success) return json({ error: '回复内容无效' }, 400);
    const parent = sqlite
      .prepare(
        'SELECT article_id,moment_id,approved,deleted FROM comments WHERE id=?',
      )
      .get(p.data.id) as
      | {
          article_id: number | null;
          moment_id: number | null;
          approved: number;
          deleted: number;
        }
      | undefined;
    if (!parent || !canReplyTo(p.data.id, parent.article_id, parent.moment_id))
      return json({ error: '请先公开该留言再回复' }, 400);
    const admin = await requireAuth(ctx);
    sqlite
      .prepare(
        'INSERT INTO comments(article_id,moment_id,parent_id,name,content,approved,is_admin,avatar) VALUES(?,?,?,?,?,1,1,?)',
      )
      .run(
        parent.article_id,
        parent.moment_id,
        p.data.id,
        admin!.username,
        p.data.content,
        randomBytes(8).toString('hex'),
      );
  } else if (
    ['approve', 'hide', 'delete-comment', 'delete-moment'].includes(b.action) &&
    Number.isSafeInteger(b.id) &&
    b.id > 0
  ) {
    if (b.action === 'delete-moment')
      sqlite
        .prepare(
          'UPDATE moments SET deleted_at=CURRENT_TIMESTAMP,visible=0 WHERE id=?',
        )
        .run(b.id);
    else if (b.action === 'delete-comment')
      sqlite
        .prepare(
          "UPDATE comments SET deleted=1,content='',email='',website='' WHERE id=?",
        )
        .run(b.id);
    else
      sqlite
        .prepare('UPDATE comments SET approved=?,moderated=1 WHERE id=?')
        .run(Number(b.action === 'approve'), b.id);
  } else return json({ error: '无效操作' }, 400);
  return json({ success: true });
};
