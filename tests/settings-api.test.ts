import { beforeEach, describe, expect, it } from 'vitest';
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { PUT } from '../src/pages/api/admin/settings';
import { db, schema } from '../src/lib/db';
import { setSession } from '../src/lib/auth';
import { DEFAULT_METADATA_PUBLIC } from '../src/types/gallery';

function mockSession() {
  const store = new Map<string, unknown>();
  return {
    set: async (key: string, value: unknown) => { store.set(key, value); },
    get: async (key: string) => store.get(key) ?? null,
    destroy: async () => { store.clear(); },
  };
}

async function authedSession() {
  const session = mockSession();
  await setSession({ session } as never, { id: 1, username: 'admin' });
  return session;
}

function ctx(session: unknown, body: unknown) {
  return {
    request: new Request('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    session,
    clientAddress: '127.0.0.1',
  } as unknown as Parameters<APIRoute>[0];
}

beforeEach(() => {
  db.delete(schema.settings).where(eq(schema.settings.key, 'appearance')).run();
  db.delete(schema.settings).where(eq(schema.settings.key, 'gallery_metadata_public')).run();
  db.delete(schema.settings).where(eq(schema.settings.key, 'atomic_probe')).run();
});

describe('PUT /api/admin/settings — typed settings boundary', () => {
  it('未登录返回 401', async () => {
    expect((await PUT(ctx(mockSession(), { site_name: 'Nope' }))).status).toBe(401);
  });

  it('任一字段不合法时整批不写入', async () => {
    const session = await authedSession();
    const before = db.select().from(schema.settings).where(eq(schema.settings.key, 'site_name')).get()!.value;
    const response = await PUT(ctx(session, {
      site_name: 'Should not persist',
      site_url: 'javascript:alert(1)',
    }));

    expect(response.status).toBe(400);
    expect(db.select().from(schema.settings).where(eq(schema.settings.key, 'site_name')).get()!.value).toBe(before);
  });

  it('部分 appearance 会补齐为完整、规范化配置', async () => {
    const session = await authedSession();
    const response = await PUT(ctx(session, {
      appearance: JSON.stringify({ layout: { mode: 'list' }, effects: { grid: true } }),
    }));
    expect(response.status).toBe(200);

    const stored = db.select().from(schema.settings).where(eq(schema.settings.key, 'appearance')).get()!;
    const parsed = JSON.parse(stored.value);
    expect(parsed.layout.mode).toBe('list');
    expect(parsed.layout.maxWidth).toBe('880px');
    expect(parsed.effects.grid).toBe(true);
    expect(parsed.background.overlay.opacity).toBe(0.35);
  });

  it('拒绝 appearance 中的注入字符', async () => {
    const session = await authedSession();
    const response = await PUT(ctx(session, {
      appearance: JSON.stringify({ themeMode: "system';alert(1)//" }),
    }));
    expect(response.status).toBe(400);
    expect(db.select().from(schema.settings).where(eq(schema.settings.key, 'appearance')).get()).toBeUndefined();
  });

  it('metadata 仅接受布尔值并补齐隐私默认值', async () => {
    const session = await authedSession();
    const invalid = await PUT(ctx(session, {
      gallery_metadata_public: JSON.stringify({ location: 'false' }),
    }));
    expect(invalid.status).toBe(400);

    const valid = await PUT(ctx(session, {
      gallery_metadata_public: JSON.stringify({ camera: false }),
    }));
    expect(valid.status).toBe(200);
    const stored = db.select().from(schema.settings).where(eq(schema.settings.key, 'gallery_metadata_public')).get()!;
    expect(JSON.parse(stored.value)).toEqual({ ...DEFAULT_METADATA_PUBLIC, camera: false });
  });
});
