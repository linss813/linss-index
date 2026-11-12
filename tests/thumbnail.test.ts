import { beforeEach, describe, expect, it } from 'vitest';
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, schema } from '../src/lib/db';
import { envConfig } from '../src/lib/env';
import { getPublicThumbnail, invalidateThumbnailCache, thumbnailUrl } from '../src/lib/thumbnail';
import { GET as GET_THUMBNAIL } from '../src/pages/thumbnails/[id]';
import { getGallery } from '../src/services/gallery';

const SOURCE_NAME = 'thumbnail-test-source.png';

async function writeSource(): Promise<void> {
  mkdirSync(envConfig.uploadDir, { recursive: true });
  const source = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: { r: 30, g: 90, b: 180 } },
  }).png().toBuffer();
  writeFileSync(join(envConfig.uploadDir, SOURCE_NAME), source);
}

function seedPhoto(overrides: Partial<typeof schema.galleryPhotos.$inferInsert> = {}): number {
  return db.insert(schema.galleryPhotos).values({
    image: `/uploads/${SOURCE_NAME}`,
    mimeType: 'image/png',
    width: 1600,
    height: 1000,
    fileSize: 100,
    published: 1,
    watermarked: 0,
    sortOrder: 0,
    ...overrides,
  }).returning().get().id;
}

beforeEach(async () => {
  db.delete(schema.galleryPhotos).run();
  invalidateThumbnailCache();
  await writeSource();
});

describe('gallery thumbnail pipeline', () => {
  it('生成 WebP 缩略图，并限制长边到 640px', async () => {
    const id = seedPhoto();
    const buffer = await getPublicThumbnail(id);
    expect(buffer).not.toBeNull();
    const meta = await sharp(buffer!).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(400);
  });

  it('公开 gallery 数据使用版本化缩略图 URL，而不是原图', async () => {
    const id = seedPhoto();
    const [item] = await getGallery();
    expect(item.id).toBe(String(id));
    expect(item.thumbnail).toMatch(new RegExp(`^/thumbnails/${id}\\?v=[0-9a-f]{16}$`));
    expect(item.thumbnail).not.toBe(item.image);
  });

  it('隐藏照片无法通过缩略图路由读取', async () => {
    const id = seedPhoto({ published: 0 });
    expect(await getPublicThumbnail(id)).toBeNull();
    const context = { params: { id: String(id) } } as unknown as Parameters<APIRoute>[0];
    expect((await GET_THUMBNAIL(context)).status).toBe(404);
  });

  it('路由返回可长期缓存的 WebP', async () => {
    const id = seedPhoto();
    const context = { params: { id: String(id) } } as unknown as Parameters<APIRoute>[0];
    const response = await GET_THUMBNAIL(context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toContain('immutable');
  });

  it('缩略图 URL 由源版本决定', () => {
    const base = { id: 1, image: '/uploads/a.jpg', updatedAt: '2026-01-01', fileSize: 1, watermarked: 0 };
    expect(thumbnailUrl(base)).not.toBe(thumbnailUrl({ ...base, updatedAt: '2026-01-02' }));
  });
});
