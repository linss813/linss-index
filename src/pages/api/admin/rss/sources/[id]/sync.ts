import type { APIRoute } from 'astro';
import { getSessionAdmin, logAction } from '../../../../../../lib/auth';
import { syncRssSource } from '../../../../../../services/rss-sync';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ params, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const id = params.id && /^\d+$/.test(params.id) ? Number(params.id) : 0;
  if (!id) return json({ error: 'RSS 来源 ID 非法' }, 400);
  try {
    const result = await syncRssSource(id);
    logAction('sync', 'rss_source', id, JSON.stringify(result), clientAddress);
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '同步失败' }, 502);
  }
};

