/**
 * 相册数据服务层单元测试
 * 覆盖 services/gallery.ts 的过滤（published）、排序、数据库行 → GalleryItem 转换逻辑
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { getGallery, getAllGallery, getGalleryAlbums, getAllGalleryAlbums } from '../src/services/gallery';
import { db, schema } from '../src/lib/db';

/** 清空并写入相册测试数据（幂等，保证任意执行顺序下状态一致） */
function seedGallery(): void {
  db.delete(schema.galleryPhotos).run();
  db.insert(schema.galleryPhotos).values([
    // 完整字段：本地路径 + 缩略图 + 分类 + 日期
    { title: 'Mountain', description: '雪山日出', image: '/uploads/mtn.webp', thumbnail: '/uploads/mtn-t.webp', category: 'Travel', date: '2026-08-01', sortOrder: 2, published: 1 },
    // 未发布：不应出现在 getGallery 结果中
    { title: 'Draft', description: null, image: 'https://files.example.com/d/gallery/draft.webp', thumbnail: null, category: null, date: null, sortOrder: 0, published: 0 },
    // 最小字段：仅 image 必填，其余全空
    { title: null, description: null, image: 'https://cdn.example.com/pic.jpg', thumbnail: null, category: null, date: null, sortOrder: 0, published: 1 },
    // 排序值为负：验证升序排序正确
    { title: 'First', description: '置顶照片', image: '/uploads/first.png', thumbnail: null, category: 'Life', date: '2026-07-15', sortOrder: -5, published: 1 },
  ]).run();
}

describe('getGallery — 公开相册查询', () => {
  it('只返回已发布照片（Draft 不出现）', async () => {
    seedGallery();
    const items = await getGallery();
    const titles = items.map((i) => i.title);
    expect(titles).not.toContain('Draft');
    expect(items.every((i) => i.published)).toBe(true);
  });

  it('按 sortOrder 升序排序（负值排最前，相同值保持插入序）', async () => {
    seedGallery();
    const items = await getGallery();
    // First(-5) → 最小字段项(0) → Mountain(2)
    expect(items[0].title).toBe('First');
    expect(items[1].title).toBeUndefined();
    expect(items[2].title).toBe('Mountain');
  });

  it('数据库行正确转换为 GalleryItem：id 为字符串、published 为 boolean', async () => {
    seedGallery();
    const items = await getGallery();
    const mountain = items.find((i) => i.title === 'Mountain')!;
    expect(typeof mountain.id).toBe('string');
    expect(mountain.published).toBe(true);
    expect(mountain.image).toBe('/uploads/mtn.webp');
    expect(mountain.thumbnail).toBe('/uploads/mtn-t.webp');
    expect(mountain.category).toBe('Travel');
    expect(mountain.date).toBe('2026-08-01');
    expect(mountain.sortOrder).toBe(2);
  });

  it('可空字段（title/description 等）转换为 undefined 而非 null', async () => {
    seedGallery();
    const items = await getGallery();
    const minimal = items.find((i) => i.image === 'https://cdn.example.com/pic.jpg')!;
    expect(minimal.title).toBeUndefined();
    expect(minimal.description).toBeUndefined();
    expect(minimal.thumbnail).toBeUndefined();
    expect(minimal.category).toBeUndefined();
    expect(minimal.date).toBeUndefined();
    expect(minimal.published).toBe(true);
  });

  it('image 为必填字段且原样保留（支持外部 URL）', async () => {
    seedGallery();
    const items = await getGallery();
    const external = items.find((i) => i.image === 'https://files.example.com/d/gallery/draft.webp');
    // 外部 URL 的未发布照片不应出现
    expect(external).toBeUndefined();
    const cdn = items.find((i) => i.image === 'https://cdn.example.com/pic.jpg');
    expect(cdn?.image).toBe('https://cdn.example.com/pic.jpg');
  });
});

describe('getAllGallery — 全量查询（含未发布）', () => {
  it('返回全部照片，包括未发布的 Draft', async () => {
    seedGallery();
    const items = await getAllGallery();
    expect(items).toHaveLength(4);
    const draft = items.find((i) => i.title === 'Draft')!;
    expect(draft.published).toBe(false);
    // 未发布项的可空字段同样转换为 undefined
    expect(draft.description).toBeUndefined();
    expect(draft.thumbnail).toBeUndefined();
  });
});

/* ---------- Album 分组（v2.4.0） ---------- */

/** 写入相册与照片测试数据（幂等） */
function seedAlbums(): void {
  db.delete(schema.galleryPhotos).run();
  db.delete(schema.galleryAlbums).run();
  db.insert(schema.galleryAlbums).values([
    { name: 'Travel', description: '旅途记录', sortOrder: 2, published: 1 },
    { name: 'Hidden', sortOrder: 0, published: 0 },
    { name: 'Daily', sortOrder: 1, published: 1 },
  ]).run();
  const travel = db.select().from(schema.galleryAlbums).where(eq(schema.galleryAlbums.name, 'Travel')).get()!;
  const daily = db.select().from(schema.galleryAlbums).where(eq(schema.galleryAlbums.name, 'Daily')).get()!;
  db.insert(schema.galleryPhotos).values([
    // Travel 相册：2 张公开
    { image: '/uploads/t1.webp', albumId: travel.id, sortOrder: 0, published: 1 },
    { image: '/uploads/t2.webp', albumId: travel.id, sortOrder: 1, published: 1 },
    // Daily 相册：1 张公开 + 1 张隐藏（隐藏不计入公开照片数）
    { image: '/uploads/d1.webp', albumId: daily.id, sortOrder: 0, published: 1 },
    { image: '/uploads/d2.webp', albumId: daily.id, sortOrder: 1, published: 0 },
    // 未分组
    { image: '/uploads/n1.webp', albumId: null, sortOrder: 0, published: 1 },
  ]).run();
}

describe('getGalleryAlbums — 公开相册分组', () => {
  it('只返回公开相册（Hidden 不出现），按 sortOrder 升序', async () => {
    seedAlbums();
    const albums = await getGalleryAlbums();
    expect(albums.map((a) => a.name)).toEqual(['Daily', 'Travel']);
  });

  it('photoCount 只统计该相册下的公开照片', async () => {
    seedAlbums();
    const albums = await getGalleryAlbums();
    expect(albums.find((a) => a.name === 'Travel')!.photoCount).toBe(2);
    expect(albums.find((a) => a.name === 'Daily')!.photoCount).toBe(1);
  });

  it('数据库行转换为前台视图：id 为字符串、published 为 boolean', async () => {
    seedAlbums();
    const albums = await getGalleryAlbums();
    const travel = albums.find((a) => a.name === 'Travel')!;
    expect(typeof travel.id).toBe('string');
    expect(travel.published).toBe(true);
    expect(travel.description).toBe('旅途记录');
  });
});

describe('getAllGalleryAlbums — 全量相册（后台用）', () => {
  it('包含未发布相册，且 photoCount 统计包含隐藏照片', async () => {
    seedAlbums();
    const albums = await getAllGalleryAlbums();
    expect(albums).toHaveLength(3);
    // 后台视角：Daily 的隐藏照片也计入（photoCount=2）
    expect(albums.find((a) => a.name === 'Daily')!.photoCount).toBe(2);
    // 未发布相册 published=false
    expect(albums.find((a) => a.name === 'Hidden')!.published).toBe(false);
  });
});

describe('getGallery — 按相册过滤', () => {
  it('albumId 过滤只返回该相册的公开照片', async () => {
    seedAlbums();
    const travel = db.select().from(schema.galleryAlbums).where(eq(schema.galleryAlbums.name, 'Travel')).get()!;
    const items = await getGallery(travel.id);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.albumId === String(travel.id))).toBe(true);
  });

  it('不过滤时返回全部公开照片（含未分组）', async () => {
    seedAlbums();
    const items = await getGallery();
    expect(items).toHaveLength(4);
  });
});
