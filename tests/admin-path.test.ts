/**
 * 后台访问路径管理单元测试
 * 覆盖路径校验（格式/保留字/大小写规范化）、URL 拼接、入口令牌、设置读取回退
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeAdminPath,
  adminUrl,
  adminEntryToken,
  internalRewriteToken,
  getAdminBasePath,
  ADMIN_PATH_SETTING_KEY,
  DEFAULT_ADMIN_PATH,
} from '../src/lib/admin-path';
import { GET, PUT } from '../src/pages/api/admin/admin-path';
import { setSession, type SessionAdmin } from '../src/lib/auth';
import { db, schema } from '../src/lib/db';
import { eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';

beforeEach(() => {
  db.delete(schema.settings).where(eq(schema.settings.key, ADMIN_PATH_SETTING_KEY)).run();
});

describe('normalizeAdminPath — 路径校验', () => {
  it('合法路径通过（小写字母/数字/连字符/下划线）', () => {
    expect(normalizeAdminPath('secret-panel').ok).toBe(true);
    expect(normalizeAdminPath('my_admin_2026').ok).toBe(true);
    expect(normalizeAdminPath('x9y').ok).toBe(true);
  });

  it('自动去除首尾斜杠并转小写', () => {
    const r = normalizeAdminPath('/Secret-Panel/');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('secret-panel');
  });

  it('默认路径允许（用于恢复默认）', () => {
    const r = normalizeAdminPath(DEFAULT_ADMIN_PATH);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(DEFAULT_ADMIN_PATH);
  });

  it('过短（<3 位）拒绝', () => {
    expect(normalizeAdminPath('ab').ok).toBe(false);
    expect(normalizeAdminPath('a1').ok).toBe(false);
  });

  it('非法字符拒绝（空格/中文/点/斜杠内容）', () => {
    expect(normalizeAdminPath('my panel').ok).toBe(false);
    expect(normalizeAdminPath('后台路径').ok).toBe(false);
    expect(normalizeAdminPath('se.cret').ok).toBe(false);
  });

  it('保留字拒绝', () => {
    // 以下保留字即使格式合法也必须被拒（错误信息指明保留冲突）
    for (const reserved of ['api', 'uploads', 'gallery', 'services']) {
      const r = normalizeAdminPath(reserved);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('保留');
    }
    // 其余保留字（可能先命中格式规则）只要拒绝即可
    for (const reserved of ['_astro', 'favicon.ico']) {
      expect(normalizeAdminPath(reserved).ok).toBe(false);
    }
  });

  it('超长（>32 位）拒绝', () => {
    expect(normalizeAdminPath('a'.repeat(33)).ok).toBe(false);
  });
});

describe('adminUrl — 链接拼接', () => {
  it('默认路径下拼接后台链接', () => {
    expect(adminUrl('/settings')).toBe(`/${DEFAULT_ADMIN_PATH}/settings`);
    expect(adminUrl('')).toBe(`/${DEFAULT_ADMIN_PATH}`);
  });
});

describe('adminEntryToken — 入口令牌', () => {
  it('同一路径多次生成结果一致（确定性）', () => {
    expect(adminEntryToken('secret')).toBe(adminEntryToken('secret'));
  });
  it('不同路径令牌不同（改路径后旧令牌失效）', () => {
    expect(adminEntryToken('secret')).not.toBe(adminEntryToken('other-secret'));
  });
  it('令牌为十六进制摘要且长度足够（HMAC-SHA256 = 64 hex）', () => {
    const t = adminEntryToken('secret');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('internalRewriteToken — 内部重写签名', () => {
  it('多次生成结果一致（确定性，供中间件二次进入校验）', () => {
    expect(internalRewriteToken()).toBe(internalRewriteToken());
  });
  it('为 64 位十六进制 HMAC-SHA256 摘要', () => {
    expect(internalRewriteToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('与入口令牌不同（用途隔离，不可互换伪造）', () => {
    expect(internalRewriteToken()).not.toBe(adminEntryToken('admin'));
    expect(internalRewriteToken()).not.toBe(adminEntryToken('secret-panel'));
  });
  it('常见伪造值均不等于签名（外部无法凭猜测通过校验）', () => {
    const token = internalRewriteToken();
    for (const fake of ['1', 'true', 'admin', '', '0'.repeat(64)]) {
      expect(token).not.toBe(fake);
    }
  });
});

describe('getAdminBasePath — 配置读取', () => {
  it('未配置时返回默认 admin', () => {
    expect(getAdminBasePath()).toBe(DEFAULT_ADMIN_PATH);
  });

  it('读取已配置的合法路径', () => {
    db.insert(schema.settings).values({ key: ADMIN_PATH_SETTING_KEY, value: 'secret-panel' }).run();
    expect(getAdminBasePath()).toBe('secret-panel');
  });

  it('数据库中为非法值时安全回退到默认（永不崩溃）', () => {
    db.insert(schema.settings).values({ key: ADMIN_PATH_SETTING_KEY, value: '非法 路径!!' }).run();
    expect(getAdminBasePath()).toBe(DEFAULT_ADMIN_PATH);
  });

  it('自定义路径下 adminUrl 按新路径拼接', () => {
    db.insert(schema.settings).values({ key: ADMIN_PATH_SETTING_KEY, value: 'secret-panel' }).run();
    expect(adminUrl('/gallery')).toBe('/secret-panel/gallery');
    expect(adminUrl('')).toBe('/secret-panel');
  });
});

/* ==================== API 端点测试 ==================== */

/** 构造模拟会话（内存 Map） */
function mockSession() {
  const store = new Map<string, unknown>();
  return {
    set: async (k: string, v: unknown) => { store.set(k, v); },
    get: async (k: string) => store.get(k) ?? null,
    destroy: async () => { store.clear(); },
  };
}

/** 构造 PUT 上下文 */
function ctx(session: unknown, body?: unknown) {
  return {
    request: new Request('http://localhost/api/admin/admin-path', {
      method: body ? 'PUT' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    session,
    clientAddress: '127.0.0.1',
  } as unknown as Parameters<APIRoute>[0];
}

describe('GET /api/admin/admin-path', () => {
  it('未登录返回 401', async () => {
    const res = await GET(ctx(mockSession()));
    expect(res.status).toBe(401);
  });

  it('登录后返回当前路径与完整 URL', async () => {
    const session = mockSession();
    await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
    const res = await GET(ctx(session));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toBe(DEFAULT_ADMIN_PATH);
    expect(data.isDefault).toBe(true);
    expect(data.url).toBe(`/${DEFAULT_ADMIN_PATH}`);
  });
});

describe('PUT /api/admin/admin-path', () => {
  it('合法路径写入 settings 并返回新 URL', async () => {
    const session = mockSession();
    await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
    const res = await PUT(ctx(session, { path: '/Secret-Panel/' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.path).toBe('secret-panel');
    expect(data.url).toBe('/secret-panel');
    // getAdminBasePath 立即反映新配置
    expect(getAdminBasePath()).toBe('secret-panel');
  });

  it('保留字返回 400', async () => {
    const session = mockSession();
    await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
    const res = await PUT(ctx(session, { path: 'api' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('保留');
  });

  it('恢复默认路径成功（isDefault=true）', async () => {
    const session = mockSession();
    await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
    const res = await PUT(ctx(session, { path: DEFAULT_ADMIN_PATH }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isDefault).toBe(true);
  });

  it('未登录返回 401', async () => {
    const res = await PUT(ctx(mockSession(), { path: 'secret' }));
    expect(res.status).toBe(401);
  });
});
