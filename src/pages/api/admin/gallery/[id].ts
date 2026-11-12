/**
 * Gallery 单条管理 API
 * PUT    /api/admin/gallery/:id — 更新照片信息（标题 / 描述 / 分类 / 日期 / 排序 / 发布状态）
 * DELETE /api/admin/gallery/:id — 删除照片（本地上传文件同时删除物理文件，外部 URL 仅删记录）
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { envConfig } from '../../../../lib/env';
import { invalidateWatermarkCache } from '../../../../lib/watermark';
import { invalidateThumbnailCache } from '../../../../lib/thumbnail';
import { invalidatePreviewCache } from '../../../../lib/preview';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** 更新照片校验 schema（全部字段可选，仅更新传入项） */
const updateSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  /** 所属相册（null = 未分组） */
  albumId: z.number().int().positive().nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').nullable().optional(),
  sortOrder: z.number().int().optional(),
  published: z.boolean().optional(),
  /** 是否添加水印（v2.6.0） */
  watermarked: z.boolean().optional(),
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
  if (!admin) return json({ error: '未登录' }, 401);

  // 解析路径参数 id
  const id = parseInt(params.id as string, 10);
  if (isNaN(id)) return json({ error: '无效 ID' }, 400);

  // 解析并校验请求体
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  }

  // 构造更新数据：只更新已传入的字段
  const d = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  if (d.title !== undefined) updateData.title = d.title;
  if (d.description !== undefined) updateData.description = d.description;
  if (d.thumbnail !== undefined) updateData.thumbnail = d.thumbnail;
  if (d.albumId !== undefined) updateData.albumId = d.albumId;
  if (d.category !== undefined) updateData.category = d.category;
  if (d.date !== undefined) updateData.date = d.date;
  if (d.sortOrder !== undefined) updateData.sortOrder = d.sortOrder;
  if (d.published !== undefined) updateData.published = d.published ? 1 : 0;
  if (d.watermarked !== undefined) updateData.watermarked = d.watermarked ? 1 : 0;

  db.update(schema.galleryPhotos).set(updateData).where(eq(schema.galleryPhotos.id, id)).run();
  // 水印开关变化时清理该照片的水印缓存（切换后前台立即生效）
  if (d.watermarked !== undefined) invalidateWatermarkCache(id);
  if (d.watermarked !== undefined) invalidateThumbnailCache(id);
  if (d.watermarked !== undefined) invalidatePreviewCache(id);
  clearCache();
  logAction('update', 'gallery', id, JSON.stringify(d), clientAddress);

  const updated = db.select().from(schema.galleryPhotos).where(eq(schema.galleryPhotos.id, id)).get();
  return json(updated);
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  // 解析路径参数 id
  const id = parseInt(params.id as string, 10);
  if (isNaN(id)) return json({ error: '无效 ID' }, 400);

  const row = db.select().from(schema.galleryPhotos).where(eq(schema.galleryPhotos.id, id)).get();
  if (!row) return json({ error: '记录不存在' }, 404);

  // 删除数据库记录
  db.delete(schema.galleryPhotos).where(eq(schema.galleryPhotos.id, id)).run();
  // 清理该照片的水印缓存文件
  invalidateWatermarkCache(id);
  invalidateThumbnailCache(id);
  invalidatePreviewCache(id);

  // 本地上传的文件（/uploads/ 路径）尝试删除物理文件；外部 URL 无需处理
  if (row.image.startsWith('/uploads/')) {
    try {
      unlinkSync(join(envConfig.uploadDir, row.image.slice('/uploads/'.length)));
    } catch {
      /* 文件可能已被手动删除，忽略错误 */
    }
  }

  clearCache();
  logAction('delete', 'gallery', id, row.image, clientAddress);
  return json({ success: true });
};
