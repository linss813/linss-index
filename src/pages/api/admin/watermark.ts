/**
 * 水印管理 API（v2.6.0）
 * GET  /api/admin/watermark — 获取当前水印配置
 * PUT  /api/admin/watermark — 更新水印配置（位置 / 透明度 / 缩放 / 边距 / 水印图）
 * POST /api/admin/watermark — 上传水印图片（multipart/form-data，推荐透明背景 PNG）
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { envConfig } from '../../../lib/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  WATERMARK_SETTING_KEY,
  getWatermarkConfig,
  invalidateWatermarkCache,
} from '../../../lib/watermark';
import { WATERMARK_POSITIONS } from '../../../types/gallery';
import { invalidateThumbnailCache } from '../../../lib/thumbnail';
import { invalidatePreviewCache } from '../../../lib/preview';

/** 允许上传的水印图 MIME 类型（推荐 PNG 透明底，JPEG/WEBP 亦可） */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ session }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);
  return json(getWatermarkConfig());
};

/** 配置更新校验：全部字段可选，仅更新传入项 */
const updateSchema = z.object({
  image: z.string().refine((v) => v === '' || v.startsWith('/uploads/'), {
    message: '水印图必须为站内 /uploads/ 路径或留空',
  }).optional(),
  position: z.enum(WATERMARK_POSITIONS as [string, ...string[]]).optional(),
  opacity: z.number().min(0).max(100).optional(),
  scale: z.number().min(5).max(60).optional(),
  margin: z.number().min(0).max(20).optional(),
  /** 自定义坐标（0-100，仅 position=custom 时参与合成） */
  posX: z.number().min(0).max(100).optional(),
  posY: z.number().min(0).max(100).optional(),
});

export const PUT: APIRoute = async ({ request, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

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

  // 合并现有配置与传入项
  const current = getWatermarkConfig();
  const next = { ...current, ...parsed.data };

  const value = JSON.stringify(next);
  const existing = db.select().from(schema.settings).where(eq(schema.settings.key, WATERMARK_SETTING_KEY)).get();
  if (existing) {
    db.update(schema.settings).set({ value, updatedAt: new Date().toISOString() }).where(eq(schema.settings.key, WATERMARK_SETTING_KEY)).run();
  } else {
    db.insert(schema.settings).values({ key: WATERMARK_SETTING_KEY, value }).run();
  }

  // 配置变更 → 全部水印缓存失效（下次访问重新合成）
  invalidateWatermarkCache();
  invalidateThumbnailCache();
  invalidatePreviewCache();
  clearCache();
  logAction('update', 'watermark', null, value, clientAddress);
  return json(next);
};

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: '请求格式错误，需为 multipart/form-data' }, 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return json({ error: '缺少上传文件（字段名 file）' }, 400);

  const ext = MIME_EXT[file.type];
  if (!ext) return json({ error: '不支持的水印图类型，仅允许 jpeg/png/webp（推荐透明背景 PNG）' }, 400);
  // 水印图通常较小，限制 2MB
  if (file.size > 2 * 1024 * 1024) return json({ error: '水印图过大，最大允许 2MB' }, 400);

  const randomName = `${randomBytes(16).toString('hex')}.${ext}`;
  try {
    mkdirSync(envConfig.uploadDir, { recursive: true });
  } catch {
    /* 目录已存在 */
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    writeFileSync(join(envConfig.uploadDir, randomName), buffer);
  } catch {
    return json({ error: '文件保存失败' }, 500);
  }

  const imageUrl = `/uploads/${randomName}`;
  logAction('upload', 'watermark', null, randomName, clientAddress);
  return json({ image: imageUrl }, 201);
};
