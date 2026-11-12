/**
 * 单博客内容服务。
 * RSS 提供文章内容，Sitemap 只用于校验和补充文章原文 URL。
 */
import { XMLParser } from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';
import hljs from 'highlight.js';
import { decodeHTML } from 'entities';
import type {
  BlogArticle,
  BlogFeedResult,
  BlogSourceInfo,
} from '../types/blog';

export const BLOG_ORIGIN = 'https://blog.luen0511.com';
export const BLOG_RSS_URL = `${BLOG_ORIGIN}/rss.xml`;
export const BLOG_SITEMAP_URL = `${BLOG_ORIGIN}/sitemap.xml`;

export const BUILTIN_BLOG_COVER = '/images/blog-default-cover.svg';

type UnknownRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  processEntities: true,
});

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function parseXml(xml: string): UnknownRecord {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML 包含不允许的声明');
  return record(parser.parse(xml));
}

function list<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value).trim();
  const row = record(value);
  return text(row['#text'] ?? row.__cdata ?? '');
}

function safeUrl(value: string, base = BLOG_ORIGIN): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function articleSlug(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts.at(-1) ?? '');
  } catch {
    return '';
  }
}

function normalizedArticleUrl(value: string): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';
  return parsed.href;
}

function resolveHtmlUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!value) return undefined;
  return safeUrl(value, baseUrl) ?? undefined;
}

function resolveSrcset(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!value) return undefined;
  const candidates = value
    .split(',')
    .map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/);
      const resolved = url ? safeUrl(url, baseUrl) : null;
      return resolved ? [resolved, ...descriptor].join(' ') : '';
    })
    .filter(Boolean);
  return candidates.length > 0 ? candidates.join(', ') : undefined;
}

function isTrackingImage(attribs: Record<string, string>): boolean {
  const src = attribs.src ?? '';
  const width = Number.parseInt(attribs.width ?? '', 10);
  const height = Number.parseInt(attribs.height ?? '', 10);
  return (
    /\/plugins\/feed\/assets\/telemetry\.gif/i.test(src) ||
    (Number.isFinite(width) && width <= 2) ||
    (Number.isFinite(height) && height <= 2)
  );
}

/** 清洗外部正文，并将图片和链接的相对路径转换为绝对路径。 */
export function sanitizeArticleHtml(html: string, articleUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'b',
      'em',
      'i',
      's',
      'del',
      'mark',
      'small',
      'sub',
      'sup',
      'blockquote',
      'ul',
      'ol',
      'li',
      'pre',
      'code',
      'kbd',
      'samp',
      'var',
      'a',
      'img',
      'picture',
      'source',
      'figure',
      'figcaption',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'details',
      'summary',
      'div',
      'span',
      'video',
      'audio',
      'aside',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: [
        'src',
        'srcset',
        'sizes',
        'alt',
        'title',
        'width',
        'height',
        'loading',
        'decoding',
      ],
      source: ['src', 'srcset', 'sizes', 'type', 'media'],
      video: ['src', 'poster', 'controls', 'preload', 'width', 'height'],
      audio: ['src', 'controls', 'preload'],
      code: ['class'],
      aside: ['data-callout'],
      details: ['data-fold', 'open'],
      ul: ['data-type'],
      li: ['data-type', 'data-checked'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
    },
    allowedClasses: { code: [/^language-[a-z0-9_-]+$/i] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          href: resolveHtmlUrl(attribs.href, articleUrl) ?? '#',
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
      img: (_tagName, attribs) => ({
        tagName: 'img',
        attribs: {
          ...attribs,
          src: resolveHtmlUrl(attribs.src, articleUrl) ?? '',
          srcset: resolveSrcset(attribs.srcset, articleUrl) ?? '',
          loading: 'lazy',
          decoding: 'async',
        },
      }),
      source: (_tagName, attribs) => ({
        tagName: 'source',
        attribs: {
          ...attribs,
          src: resolveHtmlUrl(attribs.src, articleUrl) ?? '',
          srcset: resolveSrcset(attribs.srcset, articleUrl) ?? '',
        },
      }),
      video: (_tagName, attribs) => ({
        tagName: 'video',
        attribs: {
          ...attribs,
          src: resolveHtmlUrl(attribs.src, articleUrl) ?? '',
          poster: resolveHtmlUrl(attribs.poster, articleUrl) ?? '',
          controls: 'controls',
          preload: 'metadata',
        },
      }),
      audio: (_tagName, attribs) => ({
        tagName: 'audio',
        attribs: {
          ...attribs,
          src: resolveHtmlUrl(attribs.src, articleUrl) ?? '',
          controls: 'controls',
          preload: 'metadata',
        },
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && isTrackingImage(frame.attribs),
  });
}

const LANGUAGE_ALIASES: Record<string, { id: string; label: string }> = {
  js: { id: 'javascript', label: 'JavaScript' },
  javascript: { id: 'javascript', label: 'JavaScript' },
  ts: { id: 'typescript', label: 'TypeScript' },
  typescript: { id: 'typescript', label: 'TypeScript' },
  html: { id: 'xml', label: 'HTML' },
  xml: { id: 'xml', label: 'HTML / XML' },
  css: { id: 'css', label: 'CSS' },
  java: { id: 'java', label: 'Java' },
  py: { id: 'python', label: 'Python' },
  python: { id: 'python', label: 'Python' },
  json: { id: 'json', label: 'JSON' },
  bash: { id: 'bash', label: 'Bash' },
  shell: { id: 'bash', label: 'Bash' },
  shellscript: { id: 'bash', label: 'Bash' },
  sh: { id: 'bash', label: 'Shell' },
  sql: { id: 'sql', label: 'SQL' },
  md: { id: 'markdown', label: 'Markdown' },
  markdown: { id: 'markdown', label: 'Markdown' },
};

/** 在已经清洗的 HTML 上增强代码块，输出高亮、复制和长代码折叠所需结构。 */
export function enhanceCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code(?: class="language-([a-z0-9_-]+)")?>([\s\S]*?)<\/code><\/pre>/gi,
    (_match, rawLanguage: string | undefined, encodedCode: string) => {
      const code = decodeHTML(encodedCode.replace(/<[^>]+>/g, ''));
      const language = rawLanguage
        ? LANGUAGE_ALIASES[rawLanguage.toLowerCase()]
        : undefined;
      let highlighted: string;
      try {
        highlighted =
          language && hljs.getLanguage(language.id)
            ? hljs.highlight(code, {
                language: language.id,
                ignoreIllegals: true,
              }).value
            : hljs.highlightAuto(code, [
                'javascript',
                'typescript',
                'xml',
                'css',
                'java',
                'python',
                'json',
                'bash',
                'sql',
                'markdown',
              ]).value;
      } catch {
        highlighted = sanitizeHtml(code, {
          allowedTags: [],
          allowedAttributes: {},
        });
      }
      const lines = Math.max(1, code.split(/\r?\n/).length);
      const collapsed = lines > 18 || code.length > 1_800;
      const label = language?.label ?? 'Code';
      return (
        `<div class="code-block${collapsed ? ' is-collapsed' : ''}" data-code-block>` +
        `<div class="code-toolbar"><span class="code-language">${label}</span><div class="code-actions">` +
        `${collapsed ? '<button type="button" data-code-toggle aria-expanded="false">展开</button>' : ''}` +
        '<button type="button" data-code-copy>复制</button></div></div>' +
        `<pre><code class="hljs${language ? ` language-${language.id}` : ''}">${highlighted}</code></pre>` +
        '</div>'
      );
    },
  );
}

function plainSummary(html: string, fallback: string): string {
  const cleaned = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
  const source = cleaned || fallback;
  return source.length > 180 ? `${source.slice(0, 177).trimEnd()}…` : source;
}

function firstContentImage(
  html: string,
  articleUrl: string,
): string | undefined {
  const imgPattern = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgPattern.exec(html))) {
    const attrs = match[1] ?? '';
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const width = /\bwidth\s*=\s*["']?(\d+)/i.exec(attrs)?.[1];
    const height = /\bheight\s*=\s*["']?(\d+)/i.exec(attrs)?.[1];
    if (
      !src ||
      isTrackingImage({ src, width: width ?? '', height: height ?? '' })
    )
      continue;
    const resolved = safeUrl(src, articleUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

function rssCover(
  item: UnknownRecord,
  content: string,
  articleUrl: string,
): string | undefined {
  const enclosure = record(item.enclosure);
  const enclosureType = text(enclosure['@_type']);
  const enclosureUrl = text(enclosure['@_url']);
  if (enclosureUrl && (!enclosureType || enclosureType.startsWith('image/'))) {
    return safeUrl(enclosureUrl, articleUrl) ?? undefined;
  }

  for (const candidate of list(
    item['media:content'] ?? item['media:thumbnail'],
  )) {
    const media = record(candidate);
    const url = text(media['@_url']);
    if (url) return safeUrl(url, articleUrl) ?? undefined;
  }
  return firstContentImage(content, articleUrl);
}

function rssCategories(item: UnknownRecord): string[] {
  return [...new Set(list(item.category).map(text).filter(Boolean))];
}

function atomLink(entry: UnknownRecord): string {
  const links = list(entry.link).map(record);
  const alternate = links.find(
    (link) => !text(link['@_rel']) || text(link['@_rel']) === 'alternate',
  );
  return text(alternate?.['@_href'] ?? alternate?.['#text'] ?? entry.id);
}

function atomCategories(entry: UnknownRecord): string[] {
  return [
    ...new Set(
      list(entry.category)
        .map((category) => {
          const row = record(category);
          return text(row['@_term'] ?? row['#text'] ?? category);
        })
        .filter(Boolean),
    ),
  ];
}

/** 将 RSS 2.0 或 Atom XML 解析为统一文章数据。 */
export function parseBlogFeed(
  xml: string,
  sitemapUrls: Set<string> = new Set(),
  source?: BlogSourceInfo,
): Omit<BlogFeedResult, 'sitemapAvailable' | 'stale'> {
  const root = parseXml(xml);
  const rssChannel = record(record(root.rss).channel);
  const atomFeed = record(root.feed);
  const isAtom = Object.keys(atomFeed).length > 0;
  const feed = isAtom ? atomFeed : rssChannel;
  const entries = list(isAtom ? feed.entry : feed.item).map(record);
  const sourceBaseUrl = source?.siteUrl ?? source?.rssUrl ?? BLOG_ORIGIN;

  const articles = entries
    .map((entry): BlogArticle | null => {
      const rawLink = isAtom ? atomLink(entry) : text(entry.link);
      const fallbackGuid = text(entry.guid ?? entry.id);
      const requestedUrl = safeUrl(rawLink || fallbackGuid, sourceBaseUrl);
      if (!requestedUrl) return null;

      const normalized = normalizedArticleUrl(requestedUrl);
      const slug = articleSlug(requestedUrl);
      if (!slug) return null;

      const sitemapMatch =
        normalized && sitemapUrls.has(normalized)
          ? normalized
          : [...sitemapUrls].find((url) => articleSlug(url) === slug);
      const articleUrl = sitemapMatch ?? requestedUrl;
      const rawContent = text(
        isAtom
          ? (entry.content ?? entry.summary)
          : (entry['content:encoded'] ?? entry.description),
      );
      const title = text(entry.title) || '未命名文章';
      const authorRow = record(entry.author);
      const author = isAtom
        ? text(authorRow.name ?? entry.author)
        : text(entry['dc:creator'] ?? entry.author);
      const dateValue = text(entry.pubDate ?? entry.published ?? entry.updated);
      const updatedValue = text(
        entry.updated ?? entry['dc:date'] ?? entry.pubDate ?? entry.published,
      );
      const parsedDate = dateValue ? new Date(dateValue) : null;
      const parsedUpdated = updatedValue ? new Date(updatedValue) : null;
      const sanitizedContent = sanitizeArticleHtml(rawContent, articleUrl);
      const contentHtml = enhanceCodeBlocks(sanitizedContent);
      const categories = isAtom ? atomCategories(entry) : rssCategories(entry);

      return {
        slug,
        title,
        url: articleUrl,
        guid: fallbackGuid || articleUrl,
        author: author || undefined,
        publishedAt:
          parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString()
            : undefined,
        sourceUpdatedAt:
          parsedUpdated && !Number.isNaN(parsedUpdated.getTime())
            ? parsedUpdated.toISOString()
            : undefined,
        categories,
        cover: isAtom
          ? firstContentImage(rawContent, articleUrl)
          : rssCover(entry, rawContent, articleUrl),
        excerpt: plainSummary(sanitizedContent, title),
        contentHtml,
        sourceId: source?.id ?? 0,
        sourceName: source?.name ?? (text(feed.title) || '十三月杂记'),
        sourceIcon: source?.icon,
        sourceCover: source?.cover,
        sourceCategoryId: source?.categoryId,
        sourceCategoryName: source?.categoryName,
        isPrimary: source?.displayType !== 'secondary',
      };
    })
    .filter((article): article is BlogArticle => article !== null);

  articles.sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );
  return {
    title: text(feed.title) || '十三月杂记',
    description:
      text(feed.description ?? feed.subtitle) || '来自十三月杂记的最新文章',
    articles,
    source,
  };
}

/** 从 Sitemap 中只提取文章 URL，不读取任何正文信息。 */
export function parseSitemapUrls(
  xml: string,
  siteUrl = BLOG_ORIGIN,
): Set<string> {
  const root = parseXml(xml);
  const expectedOrigin = new URL(siteUrl).origin;
  const nonArticlePrefixes = [
    '/tags/',
    '/tag/',
    '/categories/',
    '/category/',
    '/authors/',
    '/author/',
    '/page/',
  ];
  const urls = list(record(root.urlset).url)
    .map((entry) =>
      normalizedArticleUrl(safeUrl(text(record(entry).loc), siteUrl) ?? ''),
    )
    .filter((url): url is string => {
      if (!url) return false;
      const parsed = new URL(url);
      return (
        parsed.origin === expectedOrigin &&
        parsed.pathname !== '/' &&
        !nonArticlePrefixes.some((prefix) => parsed.pathname.startsWith(prefix))
      );
    });
  return new Set(urls);
}
