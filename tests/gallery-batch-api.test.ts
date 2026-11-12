/**
 * Gallery 批量操作 API 单元测试
 * 覆盖 POST /api/admin/gallery/batch-update（批量发布/隐藏/移动相册）
 * 与 POST /api/admin/gallery/batch-delete（批量删除记录）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { POST as batchUpdate } from '../src/pages/api/admin/gallery/batch-update';
import { POST as batchDelete } from '../src/pages/api/admin/gallery/batch-delete';
import { setSession, type SessionAdmin } from '../src/lib/auth';
import { db, schema } from '../src/lib/db';
import type { APIRoute } from 'astro';

/** 构造模拟会话（内存 Map） */
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

/**
 * 插入若干照片记录
 * @param specs 照片规格（published / albumId / image）
 * @returns 插入后的 id 数组
 */
function seedPhotos(specs: Array<{ published?: number; albumId?: number | null; image?: string }>): number[] {
  const ids: number[] = [];
  specs.forEach((s, i) => {
    const row = db.insert(schema.galleryPhotos).values({
      image: s.image ?? `https://example.com/photo-${i}.jpg`, // 外部 URL，batch-delete 不会尝试删本地文件
      published: s.published ?? 1,
      albumId: s.albumId ?? null,
      sortOrder: i,
    }).returning().get();
    ids.push(row.id);
  });
  return ids;
}

/** 插入一个相册，返回 id */
function seedAlbum(name = '测试相册'): number {
  return db.insert(schema.galleryAlbums).values({ name, sortOrder: 0, published: 1 }).returning().get().id;
}

/** 构造 POST 上下文 */
function ctx(session: unknown, body: unknown) {
  return {
    request: new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    session,
    clientAddress: '127.0.0.1',
  } as unknown as Parameters<APIRoute>[0];
}

/** 按 id 查照片 */
function getPhoto(id: number) {
  return db.select().from(schema.galleryPhotos).all().find((r) => r.id === id)!;
}

beforeEach(() => {
  db.delete(schema.galleryPhotos).run();
  db.delete(schema.galleryAlbums).run();
});

describe('POST batch-update — 批量发布/隐藏', () => {
  it('未登录返回 401', async () => {
    const res = await batchUpdate(ctx(mockSession(), { ids: [1], action: 'publish' }));
    expect(res.status).toBe(401);
  });

  it('批量隐藏：已发布照片 published → 0', async () => {
    const session = await authedSession();
    const ids = seedPhotos([{ published: 1 }, { published: 1 }]);
    const res = await batchUpdate(ctx(session, { ids, action: 'hide' }));
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(2);
    expect(ids.every((id) => getPhoto(id).published === 0)).toBe(true);
  });

  it('批量发布：隐藏照片 published → 1', async () => {
    const session = await authedSession();
    const ids = seedPhotos([{ published: 0 }, { published: 0 }, { published: 0 }]);
    const res = await batchUpdate(ctx(session, { ids, action: 'publish' }));
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(3);
    expect(ids.every((id) => getPhoto(id).published === 1)).toBe(true);
  });

  it('ids 为空数组返回 400', async () => {
    const session = await authedSession();
    const res = await batchUpdate(ctx(session, { ids: [], action: 'publish' }));
    expect(res.status).toBe(400);
  });

  it('既无 action 也无 albumId 返回 400', async () => {
    const session = await authedSession();
    const ids = seedPhotos([{}]);
    const res = await batchUpdate(ctx(session, { ids }));
    expect(res.status).toBe(400);
  });

  it('ids 超过 100 项返回 400', async () => {
    const session = await authedSession();
    const res = await batchUpdate(ctx(session, { ids: Array.from({ length: 101 }, (_, i) => i + 1), action: 'hide' }));
    expect(res.status).toBe(400);
  });

  it('ids 含非正整数返回 400', async () => {
    const session = await authedSession();
    const res = await batchUpdate(ctx(session, { ids: [0, -1], action: 'hide' }));
    expect(res.status).toBe(400);
  });
});

describe('POST batch-update — 批量移动相册', () => {
  it('批量移动到指定相册（albumId 设置成功）', async () => {
    const session = await authedSession();
    const albumId = seedAlbum('旅行');
    const ids = seedPhotos([{ albumId: null }, { albumId: null }]);
    const res = await batchUpdate(ctx(session, { ids, albumId }));
    expect(res.status).toBe(200);
    expect(ids.every((id) => getPhoto(id).albumId === albumId)).toBe(true);
  });

  it('albumId 为 null 时批量移出相册（未分组）', async () => {
    const session = await authedSession();
    const albumId = seedAlbum('旧相册');
    const ids = seedPhotos([{ albumId }, { albumId }]);
    const res = await batchUpdate(ctx(session, { ids, albumId: null }));
    expect(res.status).toBe(200);
    expect(ids.every((id) => getPhoto(id).albumId === null)).toBe(true);
  });

  it('action 与 albumId 同时提供时两者都生效', async () => {
    const session = await authedSession();
    const albumId = seedAlbum('混合操作');
    const ids = seedPhotos([{ published: 0, albumId: null }]);
    const res = await batchUpdate(ctx(session, { ids, action: 'publish', albumId }));
    expect(res.status).toBe(200);
    const p = getPhoto(ids[0]);
    expect(p.published).toBe(1);
    expect(p.albumId).toBe(albumId);
  });

  it('不存在的 id 不报错，updated 为 0', async () => {
    const session = await authedSession();
    const res = await batchUpdate(ctx(session, { ids: [99999], action: 'hide' }));
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(0);
  });
});

describe('POST batch-delete — 批量删除', () => {
  it('未登录返回 401', async () => {
    const res = await batchDelete(ctx(mockSession(), { ids: [1] }));
    expect(res.status).toBe(401);
  });

  it('批量删除照片记录成功', async () => {
    const session = await authedSession();
    const ids = seedPhotos([{}, {}, {}]);
    const res = await batchDelete(ctx(session, { ids }));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(3);
    const remaining = db.select().from(schema.galleryPhotos).all().length;
    expect(remaining).toBe(0);
  });

  it('ids 无效（非数组）返回 400', async () => {
    const session = await authedSession();
    const res = await batchDelete(ctx(session, { ids: 'not-an-array' }));
    expect(res.status).toBe(400);
  });

  it('ids 为空数组返回 400', async () => {
    const session = await authedSession();
    const res = await batchDelete(ctx(session, { ids: [] }));
    expect(res.status).toBe(400);
  });

  it('不存在的 id 不报错，deleted 为 0', async () => {
    const session = await authedSession();
    const res = await batchDelete(ctx(session, { ids: [88888, 88889] }));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(0);
  });

  it('本地上传路径的记录删除时不报错（物理文件缺失被安全忽略）', async () => {
    const session = await authedSession();
    const ids = seedPhotos([{ image: '/uploads/non-existent-file-xyz.jpg' }]);
    const res = await batchDelete(ctx(session, { ids }));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(1);
  });
});
