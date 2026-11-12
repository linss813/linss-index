/**
 * Gallery 批量更新 API
 * POST /api/admin/gallery/batch-update — 对选中照片执行批量发布 / 隐藏 / 移动相册
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { invalidateWatermarkCache } from '../../../../lib/watermark';
import { invalidateThumbnailCache } from '../../../../lib/thumbnail';
import { invalidatePreviewCache } from '../../../../lib/preview';
import { parseIdArray } from '../../../../lib/validation';

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 批量更新校验 schema：ids 必填；action 与目标字段三选一 */
const batchUpdateSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(100),
    /** published: 批量发布 / hidden: 批量隐藏 / watermark_on / watermark_off: 批量水印开关 */
    action: z.enum(['publish', 'hide', 'watermark_on', 'watermark_off']).optional(),
    /** 移动到目标相册 ID（null = 移出相册，设为未分组） */
    albumId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => v.action !== undefined || v.albumId !== undefined, {
    message: '需要提供 action（publish/hide/watermark_on/watermark_off）或 albumId',
  });

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const parsed = batchUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  }

  const ids = parseIdArray(parsed.data.ids);
  if (!ids) return json({ error: 'ID 列表无效' }, 400);

  // 构造更新数据：仅包含本次操作目标字段
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  if (parsed.data.action === 'publish') updateData.published = 1;
  if (parsed.data.action === 'hide') updateData.published = 0;
  if (parsed.data.action === 'watermark_on') updateData.watermarked = 1;
  if (parsed.data.action === 'watermark_off') updateData.watermarked = 0;
  if (parsed.data.albumId !== undefined) updateData.albumId = parsed.data.albumId;

  const result = db
    .update(schema.galleryPhotos)
    .set(updateData)
    .where(inArray(schema.galleryPhotos.id, ids))
    .run();

  // 水印开关批量变化时清理相关照片的水印缓存
  if (parsed.data.action === 'watermark_on' || parsed.data.action === 'watermark_off') {
    for (const id of ids) {
      invalidateWatermarkCache(id);
      invalidateThumbnailCache(id);
      invalidatePreviewCache(id);
    }
  }

  clearCache();
  logAction(
    'batch_update',
    'gallery',
    null,
    `ids: ${ids.join(',')}, ${JSON.stringify({ action: parsed.data.action, albumId: parsed.data.albumId })}, count: ${result.changes}`,
    clientAddress
  );
  return json({ updated: result.changes });
};
