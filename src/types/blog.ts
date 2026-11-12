/** 当前单博客 RSS 文章的统一视图模型。 */
export interface BlogArticle {
  id?: number;
  slug: string;
  title: string;
  url: string;
  guid: string;
  author?: string;
  publishedAt?: string;
  sourceUpdatedAt?: string;
  updatedAt?: string;
  categories: string[];
  cover?: string;
  excerpt: string;
  contentHtml: string;
  sourceId: number;
  sourceName: string;
  sourceIcon?: string;
  sourceCover?: string;
  sourceCategoryId?: number;
  sourceCategoryName?: string;
  isPrimary: boolean;
  visible?: boolean;
  pinned?: boolean;
  pinOrder?: number;
  syncedAt?: string;
  matchExcerpt?: string;
}

export interface BlogSourceInfo {
  id: number;
  name: string;
  rssUrl: string;
  siteUrl?: string;
  sitemapUrl?: string;
  description: string;
  icon?: string;
  cover?: string;
  categoryId?: number;
  categoryName?: string;
  displayType: 'primary' | 'secondary';
  sortOrder: number;
}

export interface BlogCategoryInfo {
  id: number;
  name: string;
  sortOrder: number;
}

/** RSS 与 Sitemap 合并后的读取结果。 */
export interface BlogFeedResult {
  title: string;
  description: string;
  articles: BlogArticle[];
  sitemapAvailable: boolean;
  stale: boolean;
  error?: string;
  source?: BlogSourceInfo;
}

export interface BlogAggregationResult {
  primary: BlogFeedResult;
  secondaryArticles: BlogArticle[];
  categories: BlogCategoryInfo[];
  failedSources: string[];
}

export interface BlogHomeResult {
  pinned: BlogArticle[];
  latest: BlogArticle[];
  secondary: BlogArticle[];
}

export interface BlogArchiveResult {
  articles: BlogArticle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
