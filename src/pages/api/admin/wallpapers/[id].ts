/**
 * Wallpapers 单条管理 API
 * PUT    /api/admin/wallpapers/:id  — 修改壁纸（启用/禁用切换）
 * DELETE /api/admin/wallpapers/:id  — 删除壁纸（同时尝试删除物理文件）
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { envConfig } from '../../../../lib/env';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** 更新壁纸校验 schema（支持启用/禁用与排序） */
const updateSchema = z.object({
  enabled: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PUT: APIRoute = async ({ request, params, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return json({ error: '未登录' }, 401);
  }

  // 解析路径参数 id
  const id = parseInt(params.id as string, 10);
  if (isNaN(id)) {
    return json({ error: '无效 ID' }, 400);
  }

  // 解析请求体
  let body: unknown;
  try { body = await request.json(); } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  // 参数校验
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  }

  // 构造更新数据：只更新已传入的字段
  const d = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (d.enabled !== undefined) updateData.enabled = d.enabled ? 1 : 0;
  if (d.sortOrder !== undefined) updateData.sortOrder = d.sortOrder;

  db.update(schema.wallpapers).set(updateData).where(eq(schema.wallpapers.id, id)).run();
  clearCache();
  logAction('update', 'wallpapers', id, JSON.stringify(d), clientAddress);

  // 返回更新后的记录
  const updated = db.select().from(schema.wallpapers).where(eq(schema.wallpapers.id, id)).get();
  return json(updated);
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return json({ error: '未登录' }, 401);
  }

  // 解析路径参数 id
  const id = parseInt(params.id as string, 10);
  if (isNaN(id)) {
    return json({ error: '无效 ID' }, 400);
  }

  // 先获取记录，拿到文件名用于删除物理文件
  const row = db.select().from(schema.wallpapers).where(eq(schema.wallpapers.id, id)).get();
  if (!row) {
    return json({ error: '记录不存在' }, 404);
  }

  // 删除数据库记录
  db.delete(schema.wallpapers).where(eq(schema.wallpapers.id, id)).run();

  // 尝试删除物理文件（失败不影响接口结果）
  try {
    const filePath = join(envConfig.uploadDir, row.filename);
    unlinkSync(filePath);
  } catch {
    /* 文件可能已被手动删除，忽略错误 */
  }

  clearCache();
  logAction('delete', 'wallpapers', id, row.filename, clientAddress);

  return json({ success: true });
};
