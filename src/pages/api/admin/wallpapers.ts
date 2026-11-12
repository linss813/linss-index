/**
 * Wallpapers 管理 API
 * GET    /api/admin/wallpapers       — 获取全部壁纸列表（按 sort_order 排序）
 * POST   /api/admin/wallpapers       — 上传新壁纸（multipart/form-data）
 */
import type { APIRoute } from 'astro';
import { db, schema } from '../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { envConfig } from '../../../lib/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** 允许上传的 MIME 类型与对应扩展名映射 */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 最大上传文件大小（字节），默认 10MB */
const MAX_SIZE = envConfig.maxUploadSize;

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async () => {
  // 按 sort_order 升序返回全部壁纸
  const rows = db.select().from(schema.wallpapers).orderBy(schema.wallpapers.sortOrder).all();
  return json(rows);
};

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return json({ error: '未登录' }, 401);
  }

  // 解析 multipart/form-data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: '请求格式错误，需为 multipart/form-data' }, 400);
  }

  const file = formData.get('file');
  // 校验文件存在且为 File 类型
  if (!(file instanceof File)) {
    return json({ error: '缺少上传文件（字段名 file）' }, 400);
  }

  // 校验 MIME 类型白名单
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return json({ error: '不支持的图片类型，仅允许 jpeg/png/webp/gif' }, 400);
  }

  // 校验文件大小
  if (file.size > MAX_SIZE) {
    return json({ error: `文件过大，最大允许 ${Math.floor(MAX_SIZE / 1024 / 1024)}MB` }, 400);
  }

  // 生成随机文件名，避免冲突与路径遍历风险
  const randomName = `${randomBytes(16).toString('hex')}.${ext}`;

  // 确保上传目录存在
  const uploadDir = envConfig.uploadDir;
  try {
    mkdirSync(uploadDir, { recursive: true });
  } catch {
    /* 目录已存在 */
  }

  // 写入物理文件
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(uploadDir, randomName);
  try {
    writeFileSync(filePath, buffer);
  } catch (e) {
    return json({ error: '文件保存失败' }, 500);
  }

  // 新壁纸排在末尾，sort_order 取当前数量
  const maxOrder = db.select().from(schema.wallpapers).all().length;

  // 写入数据库：访问 URL 路径（由 Nginx/静态服务映射 /uploads → uploadDir）
  const result = db.insert(schema.wallpapers).values({
    filename: randomName,
    url: `/uploads/${randomName}`,
    mimeType: file.type,
    size: file.size,
    sortOrder: maxOrder,
    enabled: 1,
  }).returning().get();

  clearCache();
  logAction('upload', 'wallpapers', result.id, randomName, clientAddress);

  return json(result, 201);
};
