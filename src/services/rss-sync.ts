/** RSS 下载、解析与文章持久化。历史文章不会因 Feed 中消失而删除。 */
import { and, eq, or } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import { createHash } from 'node:crypto';
import { db, schema } from '../lib/db';
import { fetchRemoteText } from '../lib/safe-fetch';
import { parseBlogFeed, parseSitemapUrls } from './blog';
import type { BlogSourceInfo } from '../types/blog';

function sourceInfo(id: number): BlogSourceInfo | null {
  const row = db.select({
    id: schema.rssSources.id, name: schema.rssSources.name, rssUrl: schema.rssSources.rssUrl,
    siteUrl: schema.rssSources.siteUrl, sitemapUrl: schema.rssSources.sitemapUrl,
    description: schema.rssSources.description, icon: schema.rssSources.icon, cover: schema.rssSources.cover,
    categoryId: schema.rssSources.categoryId, categoryName: schema.rssCategories.name,
    displayType: schema.rssSources.displayType, sortOrder: schema.rssSources.sortOrder,
  }).from(schema.rssSources).leftJoin(schema.rssCategories, eq(schema.rssSources.categoryId, schema.rssCategories.id))
    .where(eq(schema.rssSources.id, id)).get();
  if (!row) return null;
  return {
    id: row.id, name: row.name, rssUrl: row.rssUrl, siteUrl: row.siteUrl ?? undefined,
    sitemapUrl: row.sitemapUrl ?? undefined, description: row.description,
    icon: row.icon ?? undefined, cover: row.cover ?? undefined,
    categoryId: row.categoryId ?? undefined, categoryName: row.categoryName ?? undefined,
    displayType: row.displayType === 'primary' ? 'primary' : 'secondary', sortOrder: row.sortOrder,
  };
}

function textContent(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

function uniqueSlug(base: string, sourceId: number, currentId?: number): string {
  const normalized = base.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || `article-${sourceId}`;
  let candidate = normalized;
  let suffix = 0;
  while (true) {
    const existing = db.select({ id: schema.rssArticles.id }).from(schema.rssArticles).where(eq(schema.rssArticles.slug, candidate)).get();
    if (!existing || existing.id === currentId) return candidate;
    suffix += 1;
    candidate = `${normalized}-${sourceId}${suffix > 1 ? `-${suffix}` : ''}`;
  }
}

export interface SyncResult { sourceId: number; sourceName: string; fetched: number; created: number; updated: number; skipped: number; }

export async function syncRssSource(id: number): Promise<SyncResult> {
  const source = sourceInfo(id);
  if (!source) throw new Error('RSS 来源不存在');
  const [rss, sitemap] = await Promise.allSettled([
    fetchRemoteText(source.rssUrl),
    source.sitemapUrl ? fetchRemoteText(source.sitemapUrl) : Promise.reject(new Error('未配置 Sitemap')),
  ]);
  if (rss.status === 'rejected') throw rss.reason;
  let sitemapUrls = new Set<string>();
  if (sitemap.status === 'fulfilled') {
    try { sitemapUrls = parseSitemapUrls(sitemap.value.text, source.siteUrl ?? source.rssUrl); } catch { /* Sitemap 不影响正文同步 */ }
  }
  const feed = parseBlogFeed(rss.value.text, sitemapUrls, source);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const article of feed.articles) {
      const existing = tx.select().from(schema.rssArticles).where(or(
        eq(schema.rssArticles.originalUrl, article.url),
        and(eq(schema.rssArticles.sourceId, source.id), eq(schema.rssArticles.guid, article.guid)),
      )).get();
      const slug = uniqueSlug(article.slug, source.id, existing?.id);
      const contentHash = createHash('sha256').update(JSON.stringify({
        title: article.title, author: article.author ?? null, summary: article.excerpt,
        contentHtml: article.contentHtml, cover: article.cover ?? null,
        publishedAt: article.publishedAt ?? null, sourceUpdatedAt: article.sourceUpdatedAt ?? null,
        categories: source.categoryName ? [source.categoryName] : [], tags: article.categories,
        originalUrl: article.url,
      })).digest('hex');
      if (existing?.contentHash === contentHash) {
        skipped += 1;
        continue;
      }
      const values = {
        sourceId: source.id, sourceName: source.name, sourceSiteUrl: source.siteUrl ?? null,
        guid: article.guid, slug, originalUrl: article.url, title: article.title,
        author: article.author ?? null, summary: article.excerpt,
        contentHtml: article.contentHtml, contentText: textContent(article.contentHtml),
        coverUrl: article.cover ?? null,
        categoriesJson: JSON.stringify(source.categoryName ? [source.categoryName] : []),
        tagsJson: JSON.stringify(article.categories),
        publishedAt: article.publishedAt ?? null, sourceUpdatedAt: article.sourceUpdatedAt ?? null,
        contentHash, syncedAt: now, updatedAt: now,
      };
      if (existing) {
        tx.update(schema.rssArticles).set(values).where(eq(schema.rssArticles.id, existing.id)).run();
        updated += 1;
      } else {
        tx.insert(schema.rssArticles).values(values).run();
        created += 1;
      }
    }
  });
  return { sourceId: source.id, sourceName: source.name, fetched: feed.articles.length, created, updated, skipped };
}

export async function syncAllRssSources(): Promise<{ results: SyncResult[]; failures: { sourceId: number; sourceName: string; error: string }[] }> {
  const sources = db.select().from(schema.rssSources).where(eq(schema.rssSources.enabled, 1)).all();
  // 限制同时处理的来源数量，避免订阅源增多时集中占用连接与内存。
  const settled: PromiseSettledResult<SyncResult>[] = new Array(sources.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
    while (cursor < sources.length) {
      const index = cursor++;
      try {
        settled[index] = { status: 'fulfilled', value: await syncRssSource(sources[index]!.id) };
      } catch (reason) {
        settled[index] = { status: 'rejected', reason };
      }
    }
  }));
  const results: SyncResult[] = [];
  const failures: { sourceId: number; sourceName: string; error: string }[] = [];
  settled.forEach((result, index) => {
    const source = sources[index]!;
    if (result.status === 'fulfilled') results.push(result.value);
    else failures.push({ sourceId: source.id, sourceName: source.name, error: result.reason instanceof Error ? result.reason.message : '同步失败' });
  });
  return { results, failures };
}
