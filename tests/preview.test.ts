import { beforeEach, describe, expect, it } from 'vitest';
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, schema } from '../src/lib/db';
import { envConfig } from '../src/lib/env';
import { getPublicPreview, invalidatePreviewCache, previewUrl } from '../src/lib/preview';
import { GET as GET_PREVIEW } from '../src/pages/previews/[id]';
import { getGallery } from '../src/services/gallery';

const SOURCE_NAME = 'preview-test-source.png';

async function writeSource(): Promise<void> {
  mkdirSync(envConfig.uploadDir, { recursive: true });
  const source = await sharp({
    create: { width: 2560, height: 1600, channels: 3, background: { r: 28, g: 78, b: 140 } },
  }).png().toBuffer();
  writeFileSync(join(envConfig.uploadDir, SOURCE_NAME), source);
}

function seedPhoto(overrides: Partial<typeof schema.galleryPhotos.$inferInsert> = {}): number {
  return db.insert(schema.galleryPhotos).values({
    image: `/uploads/${SOURCE_NAME}`,
    mimeType: 'image/png',
    width: 2560,
    height: 1600,
    fileSize: 8 * 1024 * 1024,
    published: 1,
    watermarked: 0,
    sortOrder: 0,
    ...overrides,
  }).returning().get().id;
}

beforeEach(async () => {
  db.delete(schema.galleryPhotos).run();
  invalidatePreviewCache();
  await writeSource();
});

describe('gallery lightbox preview pipeline', () => {
  it('生成 1920px 长边的 WebP 预览图', async () => {
    const buffer = await getPublicPreview(seedPhoto());
    expect(buffer).not.toBeNull();
    const meta = await sharp(buffer!).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1200);
  });

  it('公开 gallery 数据同时保留原图和独立预览地址', async () => {
    const id = seedPhoto();
    const [item] = await getGallery();
    expect(item.image).toBe(`/uploads/${SOURCE_NAME}`);
    expect(item.preview).toMatch(new RegExp(`^/previews/${id}\\?v=[0-9a-f]{16}$`));
    expect(item.preview).not.toBe(item.image);
  });

  it('隐藏照片无法通过预览路由读取', async () => {
    const id = seedPhoto({ published: 0 });
    expect(await getPublicPreview(id)).toBeNull();
    const context = { params: { id: String(id) } } as unknown as Parameters<APIRoute>[0];
    expect((await GET_PREVIEW(context)).status).toBe(404);
  });

  it('预览路由返回可长期缓存的 WebP', async () => {
    const id = seedPhoto();
    const context = { params: { id: String(id) } } as unknown as Parameters<APIRoute>[0];
    const response = await GET_PREVIEW(context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toContain('immutable');
  });

  it('预览 URL 随源版本变化', () => {
    const base = { id: 1, image: '/uploads/a.jpg', updatedAt: '2026-01-01', fileSize: 1, watermarked: 0 };
    expect(previewUrl(base)).not.toBe(previewUrl({ ...base, updatedAt: '2026-01-02' }));
  });
});
