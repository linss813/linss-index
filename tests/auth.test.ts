/**
 * 认证模块单元测试
 * 覆盖 verifyCredentials / Session 交互 / 操作日志
 * 使用 tests/setup.ts 提供的内存数据库种子数据
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyCredentials,
  setSession,
  getSessionAdmin,
  destroySession,
  logAction,
  type SessionAdmin,
} from '../src/lib/auth';
import { db, schema } from '../src/lib/db';
import { eq } from 'drizzle-orm';

/** 构造模拟的 Astro Session 上下文（内存 Map 存储） */
function mockContext() {
  const store = new Map<string, unknown>();
  return {
    session: {
      set: async (k: string, v: unknown) => { store.set(k, v); },
      get: async (k: string) => store.get(k) ?? null,
      destroy: async () => { store.clear(); },
    },
    _store: store,
  };
}

describe('verifyCredentials — 凭证校验', () => {
  it('正确的用户名和密码返回管理员信息', async () => {
    const admin = await verifyCredentials('admin', 'test-password-123');
    expect(admin).not.toBeNull();
    expect(admin?.username).toBe('admin');
    expect(admin?.id).toBeGreaterThan(0);
  });

  it('密码错误返回 null', async () => {
    const admin = await verifyCredentials('admin', 'wrong-password');
    expect(admin).toBeNull();
  });

  it('用户名不存在返回 null', async () => {
    const admin = await verifyCredentials('ghost', 'any-password');
    expect(admin).toBeNull();
  });

  it('空密码返回 null', async () => {
    const admin = await verifyCredentials('admin', '');
    expect(admin).toBeNull();
  });

  it('登录成功后更新 last_login_at', async () => {
    const before = db.select().from(schema.admins)
      .where(eq(schema.admins.username, 'admin')).get()?.lastLoginAt;
    await verifyCredentials('admin', 'test-password-123');
    const after = db.select().from(schema.admins)
      .where(eq(schema.admins.username, 'admin')).get()?.lastLoginAt;
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });
});

describe('Session 管理 — set / get / destroy', () => {
  const fakeAdmin: SessionAdmin = { id: 1, username: 'admin' };

  it('不存在的管理员会话被销毁', async () => {
    const ctx = mockContext();
    await setSession(ctx as never, { id: -1, username: 'deleted' });
    expect(await getSessionAdmin(ctx as never)).toBeNull();
    expect(ctx._store.size).toBe(0);
  });

  it('setSession 后可从同一上下文读取管理员', async () => {
    const ctx = mockContext();
    await setSession(ctx as never, fakeAdmin);
    const got = await getSessionAdmin(ctx as never);
    expect(got).toEqual(fakeAdmin);
  });

  it('未登录的上下文读取返回 null', async () => {
    const ctx = mockContext();
    const got = await getSessionAdmin(ctx as never);
    expect(got).toBeNull();
  });

  it('destroySession 后 Session 数据被清空', async () => {
    const ctx = mockContext();
    await setSession(ctx as never, fakeAdmin);
    await destroySession(ctx as never);
    const got = await getSessionAdmin(ctx as never);
    expect(got).toBeNull();
  });
});

describe('logAction — 操作日志', () => {
  beforeEach(() => {
    db.delete(schema.adminLogs).run();
  });

  it('日志写入包含 action / target / detail / ip', () => {
    logAction('update', 'services', 1, 'test detail', '127.0.0.1');
    const logs = db.select().from(schema.adminLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('update');
    expect(logs[0].target).toBe('services');
    expect(logs[0].targetId).toBe(1);
    expect(logs[0].detail).toBe('test detail');
    expect(logs[0].ip).toBe('127.0.0.1');
  });

  it('允许可空字段为 null', () => {
    logAction('login', null, null, null, null);
    const logs = db.select().from(schema.adminLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].target).toBeNull();
  });
});
