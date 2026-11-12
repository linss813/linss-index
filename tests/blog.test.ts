import { describe, expect, it } from 'vitest';
import { parseBlogFeed, parseSitemapUrls, sanitizeArticleHtml } from '../src/services/blog';

const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://blog.luen0511.com/archives/example-post</loc></url>
  <url><loc>https://blog.luen0511.com/tags/example</loc></url>
  <url><loc>https://outside.example/archives/nope</loc></url>
</urlset>`;

describe('blog feed service', () => {
  it('parses Halo RSS content and uses sitemap article URLs', () => {
    const rss = `<?xml version="1.0"?>
      <rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0"><channel>
        <title>十三月杂记</title><description>Blog</description>
        <item>
          <title><![CDATA[Example <Post>]]></title>
          <link>https://blog.luen0511.com/archives/example-post?from=rss</link>
          <guid>/archives/example-post</guid><dc:creator>linss</dc:creator>
          <pubDate>Tue, 8 Sep 2026 16:13:20 GMT</pubDate>
          <category>Linux</category><category>Halo</category>
          <enclosure url="/upload/cover.jpg" type="image/jpeg" length="20" />
          <description><![CDATA[
            <img src="/plugins/feed/assets/telemetry.gif" width="1" height="1">
            <h2>Heading</h2><p>Hello <strong>world</strong>.</p>
            <img src="../upload/body.jpg"><script>alert(1)</script>
          ]]></description>
        </item>
      </channel></rss>`;

    const result = parseBlogFeed(rss, parseSitemapUrls(sitemap));
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toMatchObject({
      slug: 'example-post',
      author: 'linss',
      categories: ['Linux', 'Halo'],
      cover: 'https://blog.luen0511.com/upload/cover.jpg',
      url: 'https://blog.luen0511.com/archives/example-post',
    });
    expect(result.articles[0]?.contentHtml).toContain('https://blog.luen0511.com/upload/body.jpg');
    expect(result.articles[0]?.contentHtml).not.toContain('telemetry');
    expect(result.articles[0]?.contentHtml).not.toContain('<script');
  });

  it('parses Atom entries and resolves alternate links', () => {
    const atom = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom Blog</title><subtitle>Atom description</subtitle>
        <entry><title>Atom post</title><id>tag:example,1</id>
          <link rel="alternate" href="https://blog.luen0511.com/archives/atom-post" />
          <author><name>Alice</name></author><updated>2026-09-08T12:00:00Z</updated>
          <category term="News" /><content type="html"><![CDATA[<p>Atom body</p>]]></content>
        </entry>
      </feed>`;
    const result = parseBlogFeed(atom);
    expect(result.title).toBe('Atom Blog');
    expect(result.articles[0]).toMatchObject({ slug: 'atom-post', author: 'Alice', categories: ['News'] });
    expect(result.articles[0]?.contentHtml).toContain('Atom body');
  });

  it('keeps only same-origin article URLs from the sitemap', () => {
    expect([...parseSitemapUrls(sitemap)]).toEqual([
      'https://blog.luen0511.com/archives/example-post',
    ]);
  });

  it('sanitizes active content and resolves relative image URLs', () => {
    const html = sanitizeArticleHtml(
      '<p onclick="evil()">Text</p><img src="/a.jpg" srcset="/a.jpg 1x, /a@2x.jpg 2x"><a href="javascript:evil()">bad</a><iframe src="https://evil.example"></iframe>',
      'https://blog.luen0511.com/archives/post',
    );
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('iframe');
    expect(html).toContain('https://blog.luen0511.com/a.jpg');
    expect(html).toContain('https://blog.luen0511.com/a@2x.jpg 2x');
  });

  it('rejects XML entity declarations', () => {
    expect(() => parseBlogFeed('<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss/>')).toThrow();
  });
});

