/**
 * Vitest 测试配置
 * - node 环境（后端逻辑测试）
 * - env 在测试进程启动前注入，确保 db.ts 首次 import 时环境变量已就位
 *   （不能用 setup 文件设置 DATABASE_URL：ESM import 提升会让模块体晚于依赖加载）
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10_000,
    env: {
      // NODE_ENV 不注入：env.test.ts 需要测试其默认值与 production 分支
      DATABASE_URL: ':memory:',
      SESSION_SECRET: 'test-secret',
      ADMIN_INITIAL_PASSWORD: 'test-password-123',
      // 水印测试会真实读写上传目录（sharp 合成 + 磁盘缓存），指向独立测试目录避免污染真实数据
      UPLOAD_DIR: './data/test-uploads',
    },
  },
});
