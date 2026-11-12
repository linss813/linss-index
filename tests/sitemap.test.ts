import { beforeEach, describe, expect, it } from 'vitest';
import type { APIRoute } from 'astro';
import { db, schema } from '../src/lib/db';
import { GET } from '../src/pages/sitemap.xml';

beforeEach(() => {
  db.delete(schema.rssArticles).run();
  db.delete(schema.rssSources).run();
});

function addArticle(slug: string, visible: number) {
  db.insert(schema.rssArticles).values({
    sourceName: 'Test source',
    guid: `guid-${slug}`,
    slug,
    originalUrl: `https://blog.example.com/${slug}`,
    title: `Article ${slug}`,
    summary: '',
    contentHtml: '',
    contentText: '',
    contentHash: `hash-${slug}`,
    publishedAt: '2026-09-12T08:00:00.000Z',
    updatedAt: '2026-09-12T09:00:00.000Z',
    visible,
  }).run();
}

describe('GET /sitemap.xml', () => {
  it('包含公开页面和可见文章，排除隐藏文章与后台', async () => {
    addArticle('visible-post', 1);
    addArticle('hidden-post', 0);
    addArticle('trashed-post', 1);
    db.update(schema.rssArticles).set({deletedAt:'2026-11-01'}).where((await import('drizzle-orm')).eq(schema.rssArticles.slug,'trashed-post')).run();

    const response = await GET({ site: new URL('https://luen0511.com') } as Parameters<APIRoute>[0]);
    const xml = await response.text();

    expect(response.headers.get('Content-Type')).toContain('application/xml');
    expect(xml).toContain('<loc>https://luen0511.com/</loc>');
    expect(xml).toContain('<changefreq>daily</changefreq>');
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('<loc>https://luen0511.com/tools</loc>');
    expect(xml).toContain('<changefreq>monthly</changefreq>');
    expect(xml).toContain('<loc>https://luen0511.com/blog/visible-post</loc>');
    expect(xml).toContain('<lastmod>2026-09-12T09:00:00.000Z</lastmod>');
    expect(xml).not.toContain('hidden-post');
    expect(xml).not.toContain('trashed-post');
    expect(xml).not.toContain('/admin/');
    expect(xml).not.toContain('/api/');
  });
});
