/**
 * 水印图片输出路由（v2.6.0）
 * GET /watermarked/:id — 返回照片的水印烘焙版本
 *
 * 安全设计：
 * - 仅对 watermarked=1 的本地照片生效，其余一律 404（不暴露原图）
 * - 前台所有加水印照片的 image 字段均指向本路由，原图 /uploads/ 路径不下发
 * - 合成失败时回退原图直出，保证前台永不白屏
 */
import type { APIRoute } from 'astro';
import { getWatermarkedImage } from '../../lib/watermark';
import { db, schema } from '../../lib/db';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envConfig } from '../../lib/env';

export const GET: APIRoute = async ({ params }) => {
  // 路径参数校验：仅接受正整数 ID
  const id = parseInt(params.id ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response('Not Found', { status: 404 });
  }

  // 先做公开性检查。路由 ID 可枚举，不能等水印失败后再用更宽松的
  // 条件回退原图，否则未发布/未开水印照片会被直接读取。
  const row = db.select().from(schema.galleryPhotos).where(eq(schema.galleryPhotos.id, id)).get();
  if (!row || row.published !== 1 || row.watermarked !== 1 || !row.image.startsWith('/uploads/')) {
    return new Response('Not Found', { status: 404 });
  }

  // 水印版本（含磁盘缓存）
  const result = await getWatermarkedImage(id);
  if (result) {
    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.mime,
        // 水印结果随配置指纹变化，内容不可变，可长缓存
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // 合成失败回退：仅当照片存在且为本地文件时直出原图（避免白屏）
  try {
    const buffer = readFileSync(join(envConfig.uploadDir, row.image.slice('/uploads/'.length)));
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': row.mimeType ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    /* 原图读取失败：落入 404 */
  }

  return new Response('Not Found', { status: 404 });
};
