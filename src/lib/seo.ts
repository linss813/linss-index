/** Public URL normalization shared by canonical links and Sitemap. */
export function canonicalUrl(request: URL, site: string): URL {
  const url = new URL(request.pathname.replace(/\/$/, '') || '/', site);
  for (const key of ['page', 'category', 'source', 'album', 'tag']) {
    const value = request.searchParams.get(key);
    if (value && !(key === 'page' && (!/^\d+$/.test(value) || Number(value) <= 1))) url.searchParams.set(key,value);
  }
  return url;
}
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
export function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
