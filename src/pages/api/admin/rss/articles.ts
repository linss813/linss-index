import type { APIRoute } from 'astro';
import { getSessionAdmin } from '../../../../lib/auth';
import { getArchiveArticles } from '../../../../services/articles';

export const GET: APIRoute = async ({ url, session }) => {
  if (!await getSessionAdmin({ session } as any)) return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const query = url.searchParams.get('q') ?? '';
  const rawSourceId = url.searchParams.get('sourceId');
  const sourceId = rawSourceId && /^\d+$/.test(rawSourceId) && Number(rawSourceId) > 0 ? Number(rawSourceId) : undefined;
  if (rawSourceId && !sourceId) return new Response(JSON.stringify({ error: '来源 ID 非法' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const result = getArchiveArticles({ page, pageSize: 20, query, sourceId, includeHidden: true });
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
