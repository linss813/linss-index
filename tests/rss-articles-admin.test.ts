import { beforeEach, describe, expect, it } from 'vitest';
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { POST as batchArticles } from '../src/pages/api/admin/rss/articles/batch';
import { setSession, type SessionAdmin } from '../src/lib/auth';
import { db, schema } from '../src/lib/db';
import { getArchiveArticles } from '../src/services/articles';

function mockSession() {
  const store = new Map<string, unknown>();
  return {
    set: async (key: string, value: unknown) => { store.set(key, value); },
    get: async (key: string) => store.get(key) ?? null,
    destroy: async () => { store.clear(); },
  };
}

async function authedSession() {
  const session = mockSession();
  await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
  return session;
}

function postContext(session: unknown, body: unknown) {
  return {
    request: new Request('http://localhost/api/admin/rss/articles/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    session,
    clientAddress: '127.0.0.1',
  } as unknown as Parameters<APIRoute>[0];
}

function seedSource(name: string) {
  return db.insert(schema.rssSources).values({ name, rssUrl: `https://${name}.example.com/rss.xml` }).returning().get();
}

function seedArticle(sourceId: number, sourceName: string, suffix: string, values: { visible?: number; pinned?: number; title?: string } = {}) {
  return db.insert(schema.rssArticles).values({
    sourceId,
    sourceName,
    guid: `guid-${suffix}`,
    slug: `article-${suffix}`,
    originalUrl: `https://example.com/article-${suffix}`,
    title: values.title ?? `Article ${suffix}`,
    summary: `Summary ${suffix}`,
    contentHtml: `<p>Content ${suffix}</p>`,
    contentText: `Content ${suffix}`,
    contentHash: `hash-${suffix}`,
    visible: values.visible ?? 1,
    pinned: values.pinned ?? 0,
  }).returning().get();
}

beforeEach(() => {
  db.delete(schema.rssArticles).run();
  db.delete(schema.rssSources).run();
});

describe('RSS 文章来源筛选', () => {
  it('只返回指定来源，并正确计算总数', () => {
    const first = seedSource('first');
    const second = seedSource('second');
    seedArticle(first.id, first.name, 'first-1');
    seedArticle(first.id, first.name, 'first-2');
    seedArticle(second.id, second.name, 'second-1');

    const result = getArchiveArticles({ sourceId: first.id, includeHidden: true });

    expect(result.total).toBe(2);
    expect(result.articles).toHaveLength(2);
    expect(result.articles.every((article) => article.sourceId === first.id)).toBe(true);
  });

  it('来源筛选与全文搜索可同时生效', () => {
    const first = seedSource('first');
    const second = seedSource('second');
    seedArticle(first.id, first.name, 'matching-first', { title: 'Shared keyword' });
    seedArticle(second.id, second.name, 'matching-second', { title: 'Shared keyword' });

    const result = getArchiveArticles({ sourceId: second.id, query: 'Shared', includeHidden: true });

    expect(result.total).toBe(1);
    expect(result.articles[0]?.sourceId).toBe(second.id);
  });
});

describe('RSS 文章批量操作', () => {
  it('未登录返回 401', async () => {
    const response = await batchArticles(postContext(mockSession(), { ids: [1], action: 'hide' }));
    expect(response.status).toBe(401);
  });

  it('批量隐藏和置顶选中文章', async () => {
    const session = await authedSession();
    const source = seedSource('batch');
    const articles = [seedArticle(source.id, source.name, 'batch-1'), seedArticle(source.id, source.name, 'batch-2')];
    const ids = articles.map((article) => article.id);

    const hidden = await batchArticles(postContext(session, { ids, action: 'hide' }));
    const pinned = await batchArticles(postContext(session, { ids, action: 'pin' }));

    expect((await hidden.json()).affected).toBe(2);
    expect((await pinned.json()).affected).toBe(2);
    const rows = db.select().from(schema.rssArticles).all();
    expect(rows.every((article) => article.visible === 0 && article.pinned === 1)).toBe(true);
  });

  it('批量删除仅影响选中文章', async () => {
    const session = await authedSession();
    const source = seedSource('delete');
    const selected = seedArticle(source.id, source.name, 'delete-selected');
    const retained = seedArticle(source.id, source.name, 'delete-retained');

    const response = await batchArticles(postContext(session, { ids: [selected.id], action: 'delete' }));

    expect((await response.json()).affected).toBe(1);
    expect(db.select().from(schema.rssArticles).where(eq(schema.rssArticles.id, selected.id)).get()).toBeUndefined();
    expect(db.select().from(schema.rssArticles).where(eq(schema.rssArticles.id, retained.id)).get()).toBeDefined();
  });

  it('拒绝空 ID 列表和未知操作', async () => {
    const session = await authedSession();
    expect((await batchArticles(postContext(session, { ids: [], action: 'hide' }))).status).toBe(400);
    expect((await batchArticles(postContext(session, { ids: [1], action: 'unknown' }))).status).toBe(400);
  });
});
