import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSessionAdmin } from '../../../../lib/auth';
import { urlSchema } from '../../../../lib/validation';
import { fetchRemoteText } from '../../../../lib/safe-fetch';
import { parseBlogFeed } from '../../../../services/blog';

const input = z.object({ rssUrl: urlSchema });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, session }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const parsed = input.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  try {
    const response = await fetchRemoteText(parsed.data.rssUrl);
    const feed = parseBlogFeed(response.text);
    return json({ success: true, title: feed.title, description: feed.description, articleCount: feed.articles.length, finalUrl: response.finalUrl });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '连接或解析失败' }, 422);
  }
};

