/**
 * Navigation 批量删除 API
 * POST /api/admin/navigation/batch-delete  — 按 ID 数组批量删除导航链接
 */
import type { APIRoute } from 'astro';
import { inArray } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { parseIdArray } from '../../../../lib/validation';

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  // 解析并校验 ID 数组
  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const ids = parseIdArray(body.ids);
  if (!ids) return json({ error: 'ID 列表无效：需为非空的正整数数组（最多 100 项）' }, 400);

  // 批量删除
  const result = db.delete(schema.navigation).where(inArray(schema.navigation.id, ids)).run();
  clearCache();
  logAction('batch_delete', 'navigation', null, `ids: ${ids.join(',')}, count: ${result.changes}`, clientAddress);
  return json({ deleted: result.changes });
};
