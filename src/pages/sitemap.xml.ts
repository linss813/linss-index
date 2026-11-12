import type { APIRoute } from 'astro';
import { and, isNull, desc, eq } from 'drizzle-orm';
import { canonicalUrl } from '../lib/seo';
import { db, schema, sqlite } from '../lib/db';

export const prerender = false;

type ChangeFrequency = 'daily' | 'weekly' | 'monthly';
type SitemapEntry = {
  location: string;
  modified: string | null;
  frequency: ChangeFrequency;
  priority: string;
};

const publicRoutes = [
  { path: '/', frequency: 'daily', priority: '1.0' },
  { path: '/moments', frequency: 'daily', priority: '0.7' },
  { path: '/blog', frequency: 'daily', priority: '0.9' },
  { path: '/tools', frequency: 'monthly', priority: '0.8' },
  { path: '/gallery', frequency: 'weekly', priority: '0.8' },
  { path: '/blog/archive', frequency: 'weekly', priority: '0.7' },
] as const;

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[character]!,
  );
}

function lastModified(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://luen0511.com');
  const articles = db
    .select({
      slug: schema.rssArticles.slug,
      publishedAt: schema.rssArticles.publishedAt,
      updatedAt: schema.rssArticles.updatedAt,
    })
    .from(schema.rssArticles)
    .where(and(eq(schema.rssArticles.visible, 1), isNull(schema.rssArticles.deletedAt)))
    .orderBy(desc(schema.rssArticles.publishedAt), desc(schema.rssArticles.id))
    .all();
  const galleryDates = db
    .select({ updatedAt: schema.galleryPhotos.updatedAt })
    .from(schema.galleryPhotos)
    .where(eq(schema.galleryPhotos.published, 1))
    .all();

  const newestDate = (
    values: Array<string | null | undefined>,
  ): string | null => {
    const timestamps = values
      .map(lastModified)
      .filter((value): value is string => Boolean(value));
    return timestamps.sort().at(-1) ?? null;
  };
  const latestArticle = newestDate(
    articles.flatMap((article) => [article.updatedAt, article.publishedAt]),
  );
  const latestGallery = newestDate(
    galleryDates.map((photo) => photo.updatedAt),
  );

  const moments = sqlite
    .prepare(
      'SELECT id,created_at,updated_at FROM moments WHERE visible=1 AND deleted_at IS NULL',
    )
    .all() as { id: number; created_at: string; updated_at: string | null }[];
  const urls: SitemapEntry[] = [
    ...moments.map((item) => ({
      location: new URL(`/moments/${item.id}`, origin).href,
      modified: lastModified(item.updated_at || item.created_at),
      frequency: 'weekly' as const,
      priority: '0.6',
    })),
    ...publicRoutes.map(({ path, frequency, priority }) => ({
      location: canonicalUrl(new URL(path, origin), origin.href).href,
      modified:
        path === '/' || path.startsWith('/blog')
          ? latestArticle
          : path === '/gallery'
            ? latestGallery
            : null,
      frequency,
      priority,
    })),
    ...articles.map((article) => ({
      location: new URL(`/blog/${encodeURIComponent(article.slug)}`, origin)
        .href,
      modified: lastModified(article.updatedAt ?? article.publishedAt),
      frequency: 'monthly' as const,
      priority: '0.7',
    })),
  ];
  const entries = urls
    .map(({ location, modified, frequency, priority }) =>
      [
        '  <url>',
        `    <loc>${escapeXml(location)}</loc>`,
        modified ? `    <lastmod>${modified}</lastmod>` : null,
        `    <changefreq>${frequency}</changefreq>`,
        `    <priority>${priority}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    },
  );
};
