import type { APIRoute } from 'astro';
import { getSessionAdmin, logAction } from '../../../../lib/auth';
import { syncAllRssSources } from '../../../../services/rss-sync';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const result = await syncAllRssSources();
  logAction('sync', 'rss_source', null, JSON.stringify({ success: result.results.length, failed: result.failures.length }), clientAddress);
  return json(result, result.results.length === 0 && result.failures.length > 0 ? 502 : 200);
};

