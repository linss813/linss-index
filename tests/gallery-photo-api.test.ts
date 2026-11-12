/**
 * Gallery 照片管理 API 单元测试
 * 覆盖 PUT /api/admin/gallery/:id 的标题 / 描述更新（含 null 清空、长度校验、未登录拦截）
 * 以及照片记录的新建（供后续编辑使用）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PUT as PUT_PHOTO } from '../src/pages/api/admin/gallery/[id]';
import { POST as POST_PHOTO_API } from '../src/pages/api/admin/gallery';
import { setSession, type SessionAdmin } from '../src/lib/auth';
import { db, schema } from '../src/lib/db';
import type { APIRoute } from 'astro';

/** 构造模拟的 Astro Session（内存 Map 存储） */
function mockSession() {
  const store = new Map<string, unknown>();
  return {
    set: async (k: string, v: unknown) => { store.set(k, v); },
    get: async (k: string) => store.get(k) ?? null,
    destroy: async () => { store.clear(); },
  };
}

/** 已登录会话 */
async function authedSession() {
  const session = mockSession();
  await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
  return session;
}

/** 直接插入一条照片记录（绕过文件上传），返回其数字 id */
function seedPhoto(overrides: Partial<Record<string, unknown>> = {}): number {
  const row = db.insert(schema.galleryPhotos).values({
    image: '/uploads/seed.jpg',
    title: '原始标题',
    description: '原始描述',
    published: 1,
    sortOrder: 0,
    ...overrides,
  }).returning().get();
  return row.id;
}

/** 构造 PUT 上下文 */
function putCtx(session: unknown, id: number, body: unknown) {
  return {
    request: new Request(`http://localhost/api/admin/gallery/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    session,
    clientAddress: '127.0.0.1',
    params: { id: String(id) },
  } as unknown as Parameters<APIRoute>[0];
}

beforeEach(() => {
  db.delete(schema.galleryPhotos).run();
});

describe('PUT /api/admin/gallery/:id — 编辑照片', () => {
  it('未登录返回 401', async () => {
    const res = await PUT_PHOTO(putCtx(mockSession(), 1, { title: 'x' }));
    expect(res.status).toBe(401);
  });

  it('更新标题与描述成功', async () => {
    const session = await authedSession();
    const id = seedPhoto();
    const res = await PUT_PHOTO(putCtx(session, id, { title: '新标题', description: '新描述' }));
    expect(res.status).toBe(200);
    const got = db.select().from(schema.galleryPhotos).all().find((r) => r.id === id)!;
    expect(got.title).toBe('新标题');
    expect(got.description).toBe('新描述');
  });

  it('title / description 传 null 可清空（编辑弹窗「留空清除」链路）', async () => {
    const session = await authedSession();
    const id = seedPhoto({ title: '将被清空', description: '将被清空' });
    const res = await PUT_PHOTO(putCtx(session, id, { title: null, description: null }));
    expect(res.status).toBe(200);
    const got = db.select().from(schema.galleryPhotos).all().find((r) => r.id === id)!;
    expect(got.title).toBeNull();
    expect(got.description).toBeNull();
  });

  it('描述超过 1000 字返回 400（与后端 Zod 限制一致）', async () => {
    const session = await authedSession();
    const id = seedPhoto();
    const res = await PUT_PHOTO(putCtx(session, id, { description: 'a'.repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it('标题超过 200 字返回 400', async () => {
    const session = await authedSession();
    const id = seedPhoto();
    const res = await PUT_PHOTO(putCtx(session, id, { title: 'b'.repeat(201) }));
    expect(res.status).toBe(400);
  });

  it('published 布尔值正确切换发布状态', async () => {
    const session = await authedSession();
    const id = seedPhoto({ published: 1 });
    const res = await PUT_PHOTO(putCtx(session, id, { published: false }));
    expect(res.status).toBe(200);
    const got = db.select().from(schema.galleryPhotos).all().find((r) => r.id === id)!;
    expect(got.published).toBe(0);
  });

  it('albumId 传 null 可将照片移出相册（未分组）', async () => {
    const session = await authedSession();
    const id = seedPhoto({ albumId: 3 });
    const res = await PUT_PHOTO(putCtx(session, id, { albumId: null }));
    expect(res.status).toBe(200);
    const got = db.select().from(schema.galleryPhotos).all().find((r) => r.id === id)!;
    expect(got.albumId).toBeNull();
  });
});

describe('POST /api/admin/gallery — 上传接口存在性校验', () => {
  it('路由模块可正常导入（确保文件存在且无语法错误）', () => {
    expect(typeof POST_PHOTO_API).toBe('function');
  });
});
