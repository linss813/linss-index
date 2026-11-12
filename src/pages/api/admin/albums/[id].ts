/**
 * Gallery Album 单项管理 API
 * PUT    /api/admin/albums/:id — 更新相册（名称/描述/封面/排序/发布状态）
 * DELETE /api/admin/albums/:id — 删除相册（仅解绑照片到「未分组」，不删除照片文件与记录）
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 路径参数校验：仅接受正整数 id */
function parseId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = parseInt(raw, 10);
  return id > 0 ? id : null;
}

/** 更新校验 schema（全部字段可选；name 传则非空；description/cover 允许 null 清空） */
const updateSchema = z.object({
  name: z.string().trim().min(1, '相册名称不能为空').max(200).optional(),
  description: z.string().max(1000).nullish(),
  cover: z.string().max(500).nullish(),
  sortOrder: z.number().int().optional(),
  published: z.boolean().optional(),
});

export const PUT: APIRoute = async ({ params, request, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  const id = parseId(params.id);
  if (!id) return json({ error: '相册 ID 非法' }, 400);

  const existing = db.select().from(schema.galleryAlbums).where(eq(schema.galleryAlbums.id, id)).get();
  if (!existing) return json({ error: '相册不存在' }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  }

  const d = parsed.data;
  /** 仅更新传入字段；description/cover 传入 null 或空串即清空 */
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (d.name !== undefined) updates.name = d.name;
  if (d.description !== undefined) updates.description = d.description?.trim() || null;
  if (d.cover !== undefined) updates.cover = d.cover?.trim() || null;
  if (typeof d.sortOrder === 'number') updates.sortOrder = d.sortOrder;
  if (typeof d.published === 'boolean') updates.published = d.published ? 1 : 0;

  db.update(schema.galleryAlbums).set(updates).where(eq(schema.galleryAlbums.id, id)).run();

  clearCache();
  logAction('update', 'gallery_album', id, d.name ?? existing.name, clientAddress);
  return json({ success: true });
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  const id = parseId(params.id);
  if (!id) return json({ error: '相册 ID 非法' }, 400);

  const existing = db.select().from(schema.galleryAlbums).where(eq(schema.galleryAlbums.id, id)).get();
  if (!existing) return json({ error: '相册不存在' }, 404);

  // 先解绑照片：相册内照片变为「未分组」，照片记录与文件不删除
  db.update(schema.galleryPhotos).set({ albumId: null }).where(eq(schema.galleryPhotos.albumId, id)).run();
  db.delete(schema.galleryAlbums).where(eq(schema.galleryAlbums.id, id)).run();

  clearCache();
  logAction('delete', 'gallery_album', id, existing.name, clientAddress);
  return json({ success: true });
};
