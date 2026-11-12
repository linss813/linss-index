/**
 * Wallpapers 批量删除 API
 * POST /api/admin/wallpapers/batch-delete  — 按 ID 数组批量删除壁纸（含物理文件）
 */
import type { APIRoute } from 'astro';
import { inArray } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { parseIdArray } from '../../../../lib/validation';
import { envConfig } from '../../../../lib/env';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

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

  // 先查出记录，拿到文件名用于删除物理文件
  const rows = db
    .select()
    .from(schema.wallpapers)
    .where(inArray(schema.wallpapers.id, ids))
    .all();

  // 批量删除数据库记录
  const result = db.delete(schema.wallpapers).where(inArray(schema.wallpapers.id, ids)).run();

  // 逐个尝试删除物理文件（单个失败不影响整体结果）
  for (const row of rows) {
    try {
      unlinkSync(join(envConfig.uploadDir, row.filename));
    } catch {
      /* 文件可能已被手动删除，忽略错误 */
    }
  }

  clearCache();
  logAction(
    'batch_delete',
    'wallpapers',
    null,
    `ids: ${ids.join(',')}, count: ${result.changes}`,
    clientAddress
  );
  return json({ deleted: result.changes });
};
