/**
 * 相册管理 API 单元测试
 * 覆盖 /api/admin/albums 的 POST 创建（含 null 字段归一化、排序自动递增、未登录拦截）
 * 与 /api/admin/albums/:id 的 PUT 编辑、DELETE 删除（解绑照片）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/albums';
import { PUT, DELETE } from '../src/pages/api/admin/albums/[id]';
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

/** 已登录的测试会话 */
async function authedSession() {
  const session = mockSession();
  await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
  return session;
}

/** 构造 API 上下文 */
function ctx(opts: {
  session?: unknown;
  body?: unknown;
  method?: string;
  params?: Record<string, string>;
}) {
  return {
    request: new Request('http://localhost/api/admin/albums', {
      method: opts.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
    session: opts.session ?? mockSession(),
    clientAddress: '127.0.0.1',
    params: opts.params ?? {},
  } as unknown as Parameters<APIRoute>[0];
}

/** 每个用例前清空相册与照片表，保证互不干扰 */
beforeEach(() => {
  db.delete(schema.galleryPhotos).run();
  db.delete(schema.galleryAlbums).run();
});

describe('POST /api/admin/albums — 创建相册', () => {
  it('未登录返回 401', async () => {
    const res = await POST(ctx({ body: { name: 'X' } }));
    expect(res.status).toBe(401);
  });

  it('名称为空返回 400', async () => {
    const session = await authedSession();
    const res = await POST(ctx({ session, body: { name: '   ' } }));
    expect(res.status).toBe(400);
  });

  it('description/cover 传 null（前端留空提交）可正常创建并归一化为 null', async () => {
    const session = await authedSession();
    const res = await POST(ctx({ session, body: { name: '空字段相册', description: null, cover: null, sortOrder: 0, published: true } }));
    expect(res.status).toBe(201);
    const row = db.select().from(schema.galleryAlbums).get()!;
    expect(row.name).toBe('空字段相册');
    expect(row.description).toBeNull();
    expect(row.cover).toBeNull();
  });

  it('description 传空白字符串同样归一化为 null（不保存空串）', async () => {
    const session = await authedSession();
    const res = await POST(ctx({ session, body: { name: '空白描述', description: '   ' } }));
    expect(res.status).toBe(201);
    expect(db.select().from(schema.galleryAlbums).get()!.description).toBeNull();
  });

  it('未传 sortOrder 时自动递增（首个 0，之后 max+1）', async () => {
    const session = await authedSession();
    await POST(ctx({ session, body: { name: 'A' } }));
    await POST(ctx({ session, body: { name: 'B' } }));
    const rows = db.select().from(schema.galleryAlbums).all();
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it('published 传 false 时存储为 0（隐藏相册）', async () => {
    const session = await authedSession();
    await POST(ctx({ session, body: { name: '隐藏', published: false } }));
    expect(db.select().from(schema.galleryAlbums).get()!.published).toBe(0);
  });
});

describe('PUT /api/admin/albums/:id — 编辑相册', () => {
  it('更新名称/描述/发布状态成功', async () => {
    const session = await authedSession();
    const created = await POST(ctx({ session, body: { name: '旧名', description: '旧描述' } }));
    const id = (await created.json() as { id: number }).id;
    const res = await PUT(ctx({ session, method: 'PUT', params: { id: String(id) }, body: { name: '新名', description: null, published: false } }));
    expect(res.status).toBe(200);
    const row = db.select().from(schema.galleryAlbums).get()!;
    expect(row.name).toBe('新名');
    expect(row.description).toBeNull(); // 传 null 即清空
    expect(row.published).toBe(0);
  });

  it('编辑不存在的相册返回 404', async () => {
    const session = await authedSession();
    const res = await PUT(ctx({ session, method: 'PUT', params: { id: '9999' }, body: { name: 'X' } }));
    expect(res.status).toBe(404);
  });

  it('非法 id（非数字）返回 400', async () => {
    const session = await authedSession();
    const res = await PUT(ctx({ session, method: 'PUT', params: { id: 'abc' }, body: { name: 'X' } }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/albums/:id — 删除相册', () => {
  it('相册被删除，且相册内照片解绑为「未分组」（照片记录保留）', async () => {
    const session = await authedSession();
    const created = await POST(ctx({ session, body: { name: '待删' } }));
    const id = (await created.json() as { id: number }).id;
    // 插入两张属于该相册的照片
    db.insert(schema.galleryPhotos).values([
      { image: '/uploads/a.jpg', albumId: id, published: 1, sortOrder: 0 },
      { image: '/uploads/b.jpg', albumId: id, published: 1, sortOrder: 1 },
    ]).run();

    const res = await DELETE(ctx({ session, method: 'DELETE', params: { id: String(id) } }));
    expect(res.status).toBe(200);
    expect(db.select().from(schema.galleryAlbums).all()).toHaveLength(0);
    // 照片仍在，但 albumId 已置空
    const photos = db.select().from(schema.galleryPhotos).all();
    expect(photos).toHaveLength(2);
    expect(photos.every((p) => p.albumId === null)).toBe(true);
  });

  it('删除不存在的相册返回 404', async () => {
    const session = await authedSession();
    const res = await DELETE(ctx({ session, method: 'DELETE', params: { id: '9999' } }));
    expect(res.status).toBe(404);
  });

  it('未登录返回 401', async () => {
    const res = await DELETE(ctx({ method: 'DELETE', params: { id: '1' } }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/albums — 相册列表', () => {
  it('返回相册数组且含 photoCount 计数', async () => {
    const session = await authedSession();
    const created = await POST(ctx({ session, body: { name: '计数测试' } }));
    const id = (await created.json() as { id: number }).id;
    db.insert(schema.galleryPhotos).values({ image: '/uploads/c.jpg', albumId: id, published: 1, sortOrder: 0 }).run();

    const res = await GET(ctx({ session, method: 'GET' }));
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ name: string; photoCount: number }>;
    expect(list.find((a) => a.name === '计数测试')!.photoCount).toBe(1);
  });
});
