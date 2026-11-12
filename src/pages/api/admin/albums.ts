/**
 * Gallery Album 管理 API
 * GET  /api/admin/albums — 全部相册（含未发布，附照片计数）
 * POST /api/admin/albums — 创建相册（名称必填；description/cover 为空时前端传 null，需放行）
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { getAllGalleryAlbums } from '../../../services/gallery';

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 创建相册校验 schema
 * 注意：description / cover 前端在留空时提交 null（而非省略），
 * 使用 nullish() 放行 null 与 undefined，处理器内统一归一化为 null。
 */
const createSchema = z.object({
  name: z.string().trim().min(1, '相册名称不能为空').max(200),
  description: z.string().max(1000).nullish(),
  cover: z.string().max(500).nullish(),
  sortOrder: z.number().int().optional(),
  published: z.boolean().optional(),
});

export const GET: APIRoute = async ({ session }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);
  return json(await getAllGalleryAlbums());
};

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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  }

  const d = parsed.data;
  // 排序值默认追加到末尾（前端也会传入自动递增的建议值）
  const maxRow = db.select({ sortOrder: schema.galleryAlbums.sortOrder }).from(schema.galleryAlbums).all();
  const nextOrder = maxRow.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;

  const created = db.insert(schema.galleryAlbums).values({
    name: d.name,
    // 空字符串 / 仅空白 / null 统一归一化为 null
    description: d.description?.trim() || null,
    cover: d.cover?.trim() || null,
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : nextOrder,
    published: d.published === false ? 0 : 1,
  }).returning().get();

  clearCache();
  logAction('create', 'gallery_album', created.id, d.name, clientAddress);
  return json(created, 201);
};
