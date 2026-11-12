/**
 * 环境变量模块单元测试
 * 通过 vi.resetModules + 动态 import 验证不同环境变量组合下的解析结果
 *
 * 注意：DATABASE_URL 由 vitest.config.ts 注入为 ':memory:'（供 db.ts 使用），
 * 且无法在本环境中可靠移除，因此不在此测试其默认值分支
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

/** 清除需要控制的变量（保留 vitest 注入的 DATABASE_URL） */
function cleanEnv() {
  delete process.env.PORT;
  delete process.env.MAX_UPLOAD_SIZE;
  delete process.env.NODE_ENV;
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('envConfig — 环境变量解析', () => {
  it('数字变量未设置时使用安全默认值', async () => {
    cleanEnv();
    const { envConfig } = await import('../src/lib/env');
    expect(envConfig.port).toBe(4321);
    expect(envConfig.maxUploadSize).toBe(10_485_760);
  });

  it('正确读取字符串与数字环境变量', async () => {
    cleanEnv();
    process.env.PORT = '8080';
    process.env.MAX_UPLOAD_SIZE = '2097152';
    const { envConfig } = await import('../src/lib/env');
    expect(envConfig.port).toBe(8080);
    expect(envConfig.maxUploadSize).toBe(2_097_152);
  });

  it('NODE_ENV=production 时 isProd 为 true', async () => {
    cleanEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const { envConfig } = await import('../src/lib/env');
    expect(envConfig.isProd).toBe(true);
    expect(envConfig.isDev).toBe(false);
  });
});
