/** 已入库 RSS 文章的前台/后台分页查询。 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  like,
  or,
  type SQL,
} from 'drizzle-orm';
import { db, schema, sqlite } from '../lib/db';
import { getSetting } from '../lib/queries';
import { BUILTIN_BLOG_COVER, enhanceCodeBlocks } from './blog';
import type {
  BlogArchiveResult,
  BlogArticle,
  BlogHomeResult,
} from '../types/blog';

type ArticleRow = typeof schema.rssArticles.$inferSelect;

function jsonList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function toArticle(row: ArticleRow, matchExcerpt?: string): BlogArticle {
  const source = row.sourceId
    ? db
        .select({
          name: schema.rssSources.name,
          icon: schema.rssSources.icon,
          cover: schema.rssSources.cover,
          categoryId: schema.rssSources.categoryId,
          displayType: schema.rssSources.displayType,
          categoryName: schema.rssCategories.name,
        })
        .from(schema.rssSources)
        .leftJoin(
          schema.rssCategories,
          eq(schema.rssSources.categoryId, schema.rssCategories.id),
        )
        .where(eq(schema.rssSources.id, row.sourceId))
        .get()
    : undefined;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    url: row.originalUrl,
    guid: row.guid,
    author: row.author ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
    categories: [
      ...new Set([...jsonList(row.categoriesJson), ...jsonList(row.tagsJson)]),
    ],
    cover: row.coverUrl ?? undefined,
    excerpt: row.summary,
    contentHtml: row.guid.startsWith('local:')
      ? enhanceCodeBlocks(row.contentHtml)
      : row.contentHtml,
    sourceId: row.sourceId ?? 0,
    sourceName: source?.name ?? row.sourceName,
    sourceIcon: source?.icon ?? undefined,
    sourceCover: source?.cover ?? undefined,
    sourceCategoryId: source?.categoryId ?? undefined,
    sourceCategoryName: source?.categoryName ?? undefined,
    isPrimary: source?.displayType === 'primary',
    visible: row.visible === 1,
    pinned: row.pinned === 1,
    pinOrder: row.pinOrder,
    syncedAt: row.syncedAt,
    updatedAt: row.updatedAt,
    matchExcerpt,
  };
}

export function getBlogDefaultCover(): string {
  return (
    getSetting('blog_default_cover', BUILTIN_BLOG_COVER).trim() ||
    BUILTIN_BLOG_COVER
  );
}

function primarySourceId(): number | null {
  return (
    db
      .select({ id: schema.rssSources.id })
      .from(schema.rssSources)
      .where(
        and(
          eq(schema.rssSources.enabled, 1),
          eq(schema.rssSources.displayType, 'primary'),
        ),
      )
      .get()?.id ?? null
  );
}

export function getHomeArticles(): BlogHomeResult {
  const pinnedRows = db
    .select()
    .from(schema.rssArticles)
    .where(
      and(eq(schema.rssArticles.visible, 1), eq(schema.rssArticles.pinned, 1)),
    )
    .orderBy(
      asc(schema.rssArticles.pinOrder),
      desc(schema.rssArticles.publishedAt),
      desc(schema.rssArticles.id),
    )
    .limit(50)
    .all();
  const primaryId = primarySourceId();
  const latestRows = db
    .select()
    .from(schema.rssArticles)
    .where(
      and(
        eq(schema.rssArticles.visible, 1),
        eq(schema.rssArticles.pinned, 0),
        or(
          like(schema.rssArticles.guid, 'local:%'),
          primaryId ? eq(schema.rssArticles.sourceId, primaryId) : undefined,
        ),
      ),
    )
    .orderBy(desc(schema.rssArticles.publishedAt), desc(schema.rssArticles.id))
    .limit(10)
    .all();
  const actualSecondary = db
    .select({ article: schema.rssArticles })
    .from(schema.rssArticles)
    .leftJoin(
      schema.rssSources,
      eq(schema.rssArticles.sourceId, schema.rssSources.id),
    )
    .where(
      and(
        eq(schema.rssArticles.visible, 1),
        eq(schema.rssArticles.pinned, 0),
        eq(schema.rssSources.displayType, 'secondary'),
        eq(schema.rssSources.enabled, 1),
      ),
    )
    .orderBy(desc(schema.rssArticles.publishedAt), desc(schema.rssArticles.id))
    .limit(40)
    .all()
    .map((row) => row.article);
  return {
    pinned: pinnedRows.map((row) => toArticle(row)),
    latest: latestRows.map((row) => toArticle(row)),
    secondary: actualSecondary.map((row) => toArticle(row)),
  };
}

export function getRssCategories() {
  return db
    .select()
    .from(schema.rssCategories)
    .orderBy(asc(schema.rssCategories.sortOrder), asc(schema.rssCategories.id))
    .all();
}

export function getSecondaryArticles(
  categoryId?: number,
  limit = 40,
): BlogArticle[] {
  const conditions: SQL[] = [
    eq(schema.rssArticles.visible, 1),
    eq(schema.rssArticles.pinned, 0),
    eq(schema.rssSources.displayType, 'secondary'),
    eq(schema.rssSources.enabled, 1),
  ];
  if (categoryId) conditions.push(eq(schema.rssSources.categoryId, categoryId));
  return db
    .select({ article: schema.rssArticles })
    .from(schema.rssArticles)
    .innerJoin(
      schema.rssSources,
      eq(schema.rssArticles.sourceId, schema.rssSources.id),
    )
    .where(and(...conditions))
    .orderBy(desc(schema.rssArticles.publishedAt), desc(schema.rssArticles.id))
    .limit(Math.min(Math.max(limit, 1), 100))
    .all()
    .map((row) => toArticle(row.article));
}

function searchExpression(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' AND ');
}

export interface ArchiveOptions {
  page?: number;
  pageSize?: number;
  query?: string;
  categoryId?: number;
  sourceId?: number;
  includeHidden?: boolean;
}

export function getArchiveArticles(
  options: ArchiveOptions = {},
): BlogArchiveResult {
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const query = options.query?.trim() ?? '';
  let rows: ArticleRow[] = [];
  let total = 0;

  if (query && !options.categoryId) {
    const match = searchExpression(query);
    if (match) {
      const filters = [
        options.includeHidden ? '' : 'AND a.visible = 1',
        options.sourceId ? 'AND a.source_id = ?' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const filterParams = options.sourceId ? [options.sourceId] : [];
      const hits = sqlite
        .prepare(
          `SELECT a.id, snippet(rss_articles_fts, 2, '<mark>', '</mark>', ' … ', 24) AS snippet FROM rss_articles_fts JOIN rss_articles a ON a.id = rss_articles_fts.rowid WHERE rss_articles_fts MATCH ? ${filters} ORDER BY rank LIMIT ? OFFSET ?`,
        )
        .all(match, ...filterParams, pageSize, offset) as {
        id: number;
        snippet: string;
      }[];
      total = (
        sqlite
          .prepare(
            `SELECT count(*) AS total FROM rss_articles_fts JOIN rss_articles a ON a.id = rss_articles_fts.rowid WHERE rss_articles_fts MATCH ? ${filters}`,
          )
          .get(match, ...filterParams) as { total: number }
      ).total;
      if (hits.length > 0) {
        const fetched = db
          .select()
          .from(schema.rssArticles)
          .where(
            inArray(
              schema.rssArticles.id,
              hits.map((hit) => hit.id),
            ),
          )
          .all();
        const byId = new Map(fetched.map((row) => [row.id, row]));
        rows = hits
          .map((hit) => byId.get(hit.id))
          .filter((row): row is ArticleRow => !!row);
        const snippets = new Map(hits.map((hit) => [hit.id, hit.snippet]));
        return {
          articles: rows.map((row) => toArticle(row, snippets.get(row.id))),
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
      }
    }
  } else {
    const conditions: SQL[] = [];
    if (!options.includeHidden)
      conditions.push(eq(schema.rssArticles.visible, 1));
    if (query)
      conditions.push(
        or(
          like(schema.rssArticles.title, `%${query}%`),
          like(schema.rssArticles.contentText, `%${query}%`),
        )!,
      );
    if (options.sourceId)
      conditions.push(eq(schema.rssArticles.sourceId, options.sourceId));
    if (options.categoryId) {
      const sourceIds = db
        .select({ id: schema.rssSources.id })
        .from(schema.rssSources)
        .where(eq(schema.rssSources.categoryId, options.categoryId))
        .all()
        .map((row) => row.id);
      if (sourceIds.length === 0)
        return { articles: [], total: 0, page, pageSize, totalPages: 1 };
      conditions.push(inArray(schema.rssArticles.sourceId, sourceIds));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    total =
      db.select({ value: count() }).from(schema.rssArticles).where(where).get()
        ?.value ?? 0;
    rows = db
      .select()
      .from(schema.rssArticles)
      .where(where)
      .orderBy(
        desc(schema.rssArticles.publishedAt),
        desc(schema.rssArticles.id),
      )
      .limit(pageSize)
      .offset(offset)
      .all();
  }
  return {
    articles: rows.map((row) => toArticle(row)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getArticleBySlug(slug: string): BlogArticle | null {
  const row = db
    .select()
    .from(schema.rssArticles)
    .where(
      and(eq(schema.rssArticles.slug, slug), eq(schema.rssArticles.visible, 1)),
    )
    .get();
  return row ? toArticle(row) : null;
}

/** Admin-only caller supplies a draft, without exposing editing content publicly. */
export function getArticleDraftPreview(id: number): BlogArticle | null {
  const row = db
    .select()
    .from(schema.rssArticles)
    .where(
      and(
        eq(schema.rssArticles.id, id),
        like(schema.rssArticles.guid, 'local:%'),
      ),
    )
    .get();
  if (!row || row.deletedAt) return null;
  const draft = sqlite
    .prepare('SELECT document_json FROM article_drafts WHERE article_id=?')
    .get(id) as { document_json: string } | undefined;
  return toArticle(
    draft ? { ...row, ...JSON.parse(draft.document_json) } : row,
  );
}
