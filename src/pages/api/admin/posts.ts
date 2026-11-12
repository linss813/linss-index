import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, like, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { db, schema, sqlite } from '../../../lib/db';
import { getSessionAdmin } from '../../../lib/auth';
import { sanitizeArticleHtml } from '../../../services/blog';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const input = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(250),
  slug: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}_-]+$/u),
  summary: z.string().max(1000),
  content: z.string().min(1).max(500000),
  tags: z.string().max(500),
  cover: z
    .string()
    .refine((v) => !v || /^https?:\/\//.test(v) || /^\/(?!\/)/.test(v)),
  publish: z.boolean(),
});
export const GET: APIRoute = async (context) => {
  if (!(await getSessionAdmin(context))) return json({ error: '未登录' }, 401);
  const rows = db
    .select()
    .from(schema.rssArticles)
    .where(like(schema.rssArticles.guid, 'local:%'))
    .orderBy(desc(schema.rssArticles.updatedAt))
    .all();
  return json(
    rows.map((row) => {
      const draft = sqlite
        .prepare(
          'SELECT document_json,version FROM article_drafts WHERE article_id=?',
        )
        .get(row.id) as { document_json: string; version: number } | undefined;
      return draft
        ? {
            ...row,
            ...JSON.parse(draft.document_json),
            draftVersion: draft.version,
            hasDraft: true,
          }
        : { ...row, draftVersion: 0 };
    }),
  );
};
export const POST: APIRoute = async (context) => {
  const admin = await getSessionAdmin(context);
  if (!admin) return json({ error: '未登录' }, 401);
  if (
    context.request.headers.get('origin') &&
    context.request.headers.get('origin') !== context.url.origin
  )
    return json({ error: '请求来源不匹配' }, 403);
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  const parsed = input.safeParse(body);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message }, 400);
  const p = parsed.data;
  const markdown = z
    .string()
    .max(500000)
    .optional()
    .safeParse((body as Record<string, unknown>).markdown);
  if (!markdown.success) return json({ error: 'Markdown 内容过长' }, 400);
  const existing = p.id
    ? db
        .select()
        .from(schema.rssArticles)
        .where(
          and(
            eq(schema.rssArticles.id, p.id),
            like(schema.rssArticles.guid, 'local:%'),
          ),
        )
        .get()
    : null;
  if (p.id && !existing) return json({ error: '文章不存在' }, 404);
  if (existing?.deletedAt) return json({ error: '请先从回收站恢复文章' }, 409);
  const duplicate = db
    .select()
    .from(schema.rssArticles)
    .where(eq(schema.rssArticles.slug, p.slug))
    .get();
  if (duplicate && duplicate.id !== p.id)
    return json({ error: '文章地址已被使用' }, 409);
  const clean = sanitizeArticleHtml(p.content, context.url.origin);
  const now = new Date().toISOString();
  const values = {
    title: p.title,
    slug: p.slug,
    summary: p.summary,
    contentHtml: clean,
    contentText: sanitizeHtml(clean, {
      allowedTags: [],
      allowedAttributes: {},
    }),
    tagsJson: JSON.stringify(
      p.tags
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    coverUrl: p.cover || null,
    visible: p.publish ? 1 : 0,
    originalUrl: `/blog/${encodeURIComponent(p.slug)}`,
    updatedAt: now,
    publishedAt: p.publish
      ? (existing?.publishedAt ?? now)
      : (existing?.publishedAt ?? null),
  };
  const categories = z
    .string()
    .max(100)
    .optional()
    .safeParse((body as Record<string, unknown>).categories);
  if (!categories.success) return json({ error: '分类不能超过 100 字' }, 400);
  const document = {
    ...values,
    contentMarkdown: markdown.data ?? null,
    categoriesJson:
      categories.data === undefined
        ? (existing?.categoriesJson ?? '[]')
        : JSON.stringify([
            ...new Set(
              categories.data
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ]),
  };
  const extras = body as Record<string, unknown>;
  if (
    existing &&
    extras.baseVersion !== undefined &&
    extras.baseVersion !== existing.saveVersion
  )
    return json(
      {
        error: '公开版本已在其他窗口更新，当前输入已保留，请另存副本或重新载入',
      },
      409,
    );
  const blocks = z
    .object({ type: z.literal('doc'), content: z.array(z.unknown()) })
    .optional()
    .safeParse(extras.blocks);
  if (!blocks.success || JSON.stringify(blocks.data || {}).length > 500000)
    return json({ error: '块内容格式无效或过长' }, 400);
  const blockDocument = {
    ...document,
    contentJson: blocks.data
      ? JSON.stringify({ version: 1, document: blocks.data })
      : null,
  };
  const savedDraft = existing
    ? (sqlite
        .prepare('SELECT version FROM article_drafts WHERE article_id=?')
        .get(existing.id) as { version: number } | undefined)
    : undefined;
  if (
    extras.draftVersion !== undefined &&
    extras.draftVersion !== (savedDraft?.version || 0)
  )
    return json(
      { error: '文章已在其他窗口更新，当前输入已保留，请另存副本或重新载入' },
      409,
    );
  if (existing && extras.draftOnly === true) {
    const version = (savedDraft?.version || 0) + 1;
    const draft = { ...blockDocument, visible: existing.visible };
    sqlite
      .prepare(
        'INSERT INTO article_drafts(article_id,document_json,version) VALUES(?,?,?) ON CONFLICT(article_id) DO UPDATE SET document_json=excluded.document_json,version=excluded.version,updated_at=CURRENT_TIMESTAMP',
      )
      .run(existing.id, JSON.stringify(draft), version);
    return json({
      ...existing,
      ...draft,
      draftVersion: version,
      hasDraft: true,
    });
  }
  const row = existing
    ? db
        .update(schema.rssArticles)
        .set({ ...blockDocument, saveVersion: existing.saveVersion + 1 })
        .where(eq(schema.rssArticles.id, existing.id))
        .returning()
        .get()
    : db
        .insert(schema.rssArticles)
        .values({
          ...blockDocument,
          guid: `local:${randomUUID()}`,
          sourceName: '原创',
          author: admin.username,
          contentHash: '',
        })
        .returning()
        .get();
  if (existing)
    sqlite
      .prepare('DELETE FROM article_drafts WHERE article_id=?')
      .run(existing.id);
  return json({ ...row, draftVersion: 0 });
};

export const PATCH: APIRoute = async (context) => {
  if (!(await getSessionAdmin(context))) return json({ error: '未登录' }, 401);
  const origin = context.request.headers.get('origin');
  if (origin && origin !== context.url.origin)
    return json({ error: '请求来源不匹配' }, 403);
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  const parsed = z
    .object({
      ids: z.array(z.number().int().positive()).min(1).max(100),
      action: z.enum([
        'publish',
        'draft',
        'trash',
        'restore',
        'pin',
        'unpin',
        'duplicate',
      ]),
    })
    .safeParse(body);
  if (!parsed.success) return json({ error: '操作参数错误' }, 400);
  const { ids, action } = parsed.data;
  const rows = ids.map((id) =>
    db
      .select()
      .from(schema.rssArticles)
      .where(
        and(
          eq(schema.rssArticles.id, id),
          like(schema.rssArticles.guid, 'local:%'),
        ),
      )
      .get(),
  );
  if (rows.some((row) => !row)) return json({ error: '部分文章不存在' }, 404);
  if (action !== 'restore' && rows.some((row) => row?.deletedAt))
    return json({ error: '请先恢复回收站中的文章' }, 409);
  if (action === 'publish') {
    const reserved = new Set<string>();
    for (const row of rows) {
      if (!row) continue;
      const draft = sqlite
        .prepare('SELECT document_json FROM article_drafts WHERE article_id=?')
        .get(row.id) as { document_json: string } | undefined;
      const slug = draft ? JSON.parse(draft.document_json).slug : row.slug;
      const owner = db
        .select()
        .from(schema.rssArticles)
        .where(eq(schema.rssArticles.slug, slug))
        .get();
      if (reserved.has(slug) || (owner && owner.id !== row.id))
        return json({ error: '草稿文章地址已被占用，请先编辑地址' }, 409);
      reserved.add(slug);
    }
  }
  db.transaction((tx) => {
    for (const row of rows) {
      if (!row) continue;
      const now = new Date().toISOString();
      const draftRow = sqlite
        .prepare('SELECT document_json FROM article_drafts WHERE article_id=?')
        .get(row.id) as { document_json: string } | undefined;
      const draft = draftRow ? JSON.parse(draftRow.document_json) : {};
      if (action === 'duplicate') {
        const token = randomUUID();
        const { id: _, ...copy } = { ...row, ...draft };
        tx.insert(schema.rssArticles)
          .values({
            ...copy,
            title: `${copy.title}（副本）`,
            guid: `local:${token}`,
            slug: `${copy.slug}-${token.slice(0, 8)}`,
            originalUrl: `/blog/${copy.slug}-${token.slice(0, 8)}`,
            visible: 0,
            pinned: 0,
            publishedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } else {
        const values =
          action === 'publish'
            ? { visible: 1, publishedAt: row.publishedAt ?? now }
            : action === 'draft'
              ? { visible: 0 }
              : action === 'trash'
                ? { deletedAt: now, visible: 0, pinned: 0 }
                : action === 'restore'
                  ? { deletedAt: null, visible: 0 }
                  : action === 'pin'
                    ? { pinned: 1 }
                    : { pinned: 0 };
        tx.update(schema.rssArticles)
          .set({
            ...(action === 'publish' ? draft : {}),
            ...values,
            saveVersion: row.saveVersion + 1,
            updatedAt: now,
          })
          .where(eq(schema.rssArticles.id, row.id))
          .run();
        if (action === 'publish')
          sqlite
            .prepare('DELETE FROM article_drafts WHERE article_id=?')
            .run(row.id);
      }
    }
  });
  return json({ success: true });
};
