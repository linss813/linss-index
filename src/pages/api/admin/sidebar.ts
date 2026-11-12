import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/auth';
import {
  getSidebarState,
  saveSidebar,
  sidebarDocument,
} from '../../../services/sidebars';
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
export const GET: APIRoute = async (ctx) =>
  (await requireAuth(ctx))
    ? json(getSidebarState())
    : json({ error: '未登录' }, 401);
export const POST: APIRoute = async (ctx) => {
  if (!(await requireAuth(ctx))) return json({ error: '未登录' }, 401);
  if (ctx.request.headers.get('origin') !== ctx.url.origin)
    return json({ error: '请求来源不匹配' }, 403);
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: '无效请求' }, 400);
  }
  if (!['save', 'publish'].includes(body.action))
    return json({ error: '无效操作' }, 400);
  const parsed = sidebarDocument.safeParse(body.document);
  if (!parsed.success)
    return json(
      { error: parsed.error.issues[0].message, issues: parsed.error.issues },
      400,
    );
  if (
    body.action === 'publish' &&
    parsed.data.modules.some((m) => m.kind === 'ad' && m.enabled && !m.image)
  )
    return json({ error: '启用的推广卡片请先上传或选择图片' }, 400);
  const saved = saveSidebar(parsed.data, body.action);
  return saved
    ? json({ document: saved })
    : json(
        { error: '配置已被其他窗口修改，请先重新载入；当前输入仍保留' },
        409,
      );
};
