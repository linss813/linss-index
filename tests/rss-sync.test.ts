import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/lib/db';

let feedTitle = '第一版标题';
let includeArticle = true;

vi.mock('../src/lib/safe-fetch', () => ({
  fetchRemoteText: vi.fn(async () => ({
    url: 'https://example.com/rss.xml',
    text: `<?xml version="1.0"?><rss version="2.0"><channel><title>测试源</title>${includeArticle ? `
      <item><title>${feedTitle}</title><link>/posts/one</link><guid>post-one</guid>
      <pubDate>Tue, 8 Sep 2026 16:13:20 GMT</pubDate>
      <description><![CDATA[<p>正文内容</p>]]></description></item>` : ''}</channel></rss>`,
  })),
}));

import { syncRssSource } from '../src/services/rss-sync';
import { getHomeArticles } from '../src/services/articles';

describe('RSS database sync', () => {
  beforeEach(() => {
    db.delete(schema.rssArticles).run();
    db.delete(schema.rssSources).run();
    feedTitle = '第一版标题';
    includeArticle = true;
  });

  it('creates, skips unchanged, updates changed and retains missing articles', async () => {
    const source = db.insert(schema.rssSources).values({
      name: '测试源', rssUrl: 'https://example.com/rss.xml', siteUrl: 'https://example.com',
      displayType: 'primary', enabled: 1,
    }).returning({ id: schema.rssSources.id }).get();

    expect(await syncRssSource(source.id)).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    expect(await syncRssSource(source.id)).toMatchObject({ created: 0, updated: 0, skipped: 1 });

    feedTitle = '第二版标题';
    expect(await syncRssSource(source.id)).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(db.select().from(schema.rssArticles).where(eq(schema.rssArticles.sourceId, source.id)).get()?.title).toBe('第二版标题');

    includeArticle = false;
    expect(await syncRssSource(source.id)).toMatchObject({ fetched: 0, created: 0, updated: 0 });
    expect(db.select().from(schema.rssArticles).where(eq(schema.rssArticles.sourceId, source.id)).all()).toHaveLength(1);
  });

  it('keeps pinned articles outside the latest ten ordinary articles', () => {
    const source = db.insert(schema.rssSources).values({
      name: '主页源', rssUrl: 'https://example.com/rss.xml', siteUrl: 'https://example.com',
      displayType: 'primary', enabled: 1,
    }).returning({ id: schema.rssSources.id }).get();
    db.insert(schema.rssArticles).values(Array.from({ length: 13 }, (_, index) => ({
      sourceId: source.id, sourceName: '主页源', guid: `guid-${index}`, slug: `post-${index}`,
      originalUrl: `https://example.com/posts/${index}`, title: `文章 ${index}`, summary: '摘要',
      contentHtml: '<p>正文</p>', contentText: '正文', contentHash: `hash-${index}`,
      publishedAt: new Date(Date.UTC(2026, 8, index + 1)).toISOString(),
      pinned: index < 2 ? 1 : 0, pinOrder: index,
    }))).run();

    const result = getHomeArticles();
    expect(result.pinned).toHaveLength(2);
    expect(result.latest).toHaveLength(10);
    expect(result.latest.every((article) => !article.pinned)).toBe(true);
  });
});
