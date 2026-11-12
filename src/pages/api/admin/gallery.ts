/**
 * Gallery 管理 API
 * GET  /api/admin/gallery — 获取全部照片（含未发布，按 sort_order 排序，metadata 含 GPS 等完整信息）
 * POST /api/admin/gallery — 新增照片
 *   - multipart/form-data（含 file 字段）：上传本地文件（可先在前端裁剪），自动解析 EXIF 与尺寸
 *   - application/json：按外部 URL 直接建档（图床 / OpenList / 对象存储等）
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { envConfig } from '../../../lib/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getAllGallery } from '../../../services/gallery';
import { extractExifMetadata, probeImageDimensions } from '../../../lib/gallery-meta';

/** 允许上传的 MIME 类型与对应扩展名映射 */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 最大上传文件大小（字节） */
const MAX_SIZE = envConfig.maxUploadSize;

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 图片地址校验：仅允许 http(s) 完整 URL 或站内 / 开头的相对路径，阻止 javascript: / data: 等危险协议 */
const imageUrlSchema = z
  .string()
  .refine(
    (v) => v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/'),
    { message: '图片地址必须为 http(s) URL 或以 / 开头的站内路径' }
  );

/** JSON 方式新增照片校验 schema（image 必填，其余可选） */
const createSchema = z.object({
  image: imageUrlSchema,
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  thumbnail: imageUrlSchema.optional(),
  albumId: z.number().int().positive().nullable().optional(),
  category: z.string().max(100).optional(),
  /** 展示日期，格式 YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').optional(),
  sortOrder: z.number().int().optional(),
  published: z.boolean().optional(),
});

export const GET: APIRoute = async ({ session }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  return json(await getAllGallery());
};

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) return json({ error: '未登录' }, 401);

  const contentType = request.headers.get('content-type') ?? '';

  /* ---------- 方式一：multipart 文件上传 ---------- */
  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return json({ error: '请求格式错误，需为 multipart/form-data' }, 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return json({ error: '缺少上传文件（字段名 file）' }, 400);
    }

    // MIME 白名单与大小校验（后端独立验证，不信任前端）
    const ext = MIME_EXT[file.type];
    if (!ext) return json({ error: '不支持的图片类型，仅允许 jpeg/png/webp/gif' }, 400);
    if (file.size > MAX_SIZE) {
      return json({ error: `文件过大，最大允许 ${Math.floor(MAX_SIZE / 1024 / 1024)}MB` }, 400);
    }

    // 随机文件名，避免冲突与路径遍历
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

    // 并行解析 EXIF 元数据与图片尺寸（失败不阻断上传）
    const [metadata, dimensions] = await Promise.all([
      extractExifMetadata(buffer),
      Promise.resolve(probeImageDimensions(buffer)),
    ]);

    // 可选元信息（随表单一起提交）
    const title = (formData.get('title') as string | null)?.trim() || null;
    const description = (formData.get('description') as string | null)?.trim() || null;
    const category = (formData.get('category') as string | null)?.trim() || null;
    const albumIdRaw = formData.get('albumId');
    const albumId = typeof albumIdRaw === 'string' && /^\d+$/.test(albumIdRaw) ? parseInt(albumIdRaw, 10) : null;

    const result = insertPhoto({
      title,
      description,
      image: `/uploads/${randomName}`,
      albumId,
      category,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      fileSize: file.size,
      mimeType: file.type,
      metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      takenAt: metadata.takenAt ?? null,
      sortOrder: nextSortOrder(),
      published: 1,
    });
    clearCache();
    logAction('upload', 'gallery', result.id, randomName, clientAddress);
    return json(result, 201);
  }

  /* ---------- 方式二：JSON 外部 URL 建档 ---------- */
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
  const result = insertPhoto({
    title: d.title ?? null,
    description: d.description ?? null,
    image: d.image,
    thumbnail: d.thumbnail ?? null,
    albumId: d.albumId ?? null,
    category: d.category ?? null,
    date: d.date ?? null,
    // 外部 URL 无法可靠探测文件信息，尺寸/大小/EXIF 留空
    sortOrder: d.sortOrder ?? nextSortOrder(),
    published: d.published === false ? 0 : 1,
  });
  clearCache();
  logAction('create', 'gallery', result.id, d.image, clientAddress);
  return json(result, 201);
};

/** 计算新照片的排序值（追加到末尾） */
function nextSortOrder(): number {
  const rows = db.select({ sortOrder: schema.galleryPhotos.sortOrder }).from(schema.galleryPhotos).all();
  return rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
}

/** 插入照片记录并返回结果 */
function insertPhoto(values: typeof schema.galleryPhotos.$inferInsert) {
  return db.insert(schema.galleryPhotos).values(values).returning().get();
}
