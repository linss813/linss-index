/**
 * 测试全局初始化
 * 环境变量由 vitest.config.ts 的 test.env 在进程启动前注入（见其注释）
 *
 * 注意：同一 worker 中多个测试文件可能共享 db 模块实例，
 * 因此种子写入采用「先清空、后插入」的幂等方式，保证任意执行顺序下状态一致
 */
import { db, schema } from '../src/lib/db';
import { createTables } from '../src/db/ddl';
import * as bcrypt from 'bcryptjs';

/* 第一步：建表（幂等 DDL，与 init.ts 共用同一份定义） */
createTables(db.$client);

/* 第二步：清空种子相关表，保证幂等 */
db.delete(schema.rssArticles).run();
db.delete(schema.rssSources).run();
db.delete(schema.rssCategories).run();
db.delete(schema.services).run();
db.delete(schema.navigation).run();
db.delete(schema.themes).run();
db.delete(schema.settings).run();
db.delete(schema.admins).run();
db.delete(schema.adminLogs).run();

/* ---------- services 种子：3 条启用 + 1 条禁用 ---------- */
db.insert(schema.services).values([
  { name: 'Blog', description: '个人博客', url: 'https://blog.example.com', icon: 'book-open', category: 'Content', display: 'featured', featured: 1, external: 0, sortOrder: 0, enabled: 1 },
  { name: 'Files', description: '文件存储', url: 'https://files.example.com', icon: 'folder', category: 'Content', display: 'featured', featured: 1, external: 0, sortOrder: 1, enabled: 1 },
  { name: 'Meet', description: '视频会议', url: 'https://meet.example.com', icon: 'video', category: 'Tools', display: 'card', featured: 0, external: 0, sortOrder: 2, enabled: 1 },
  { name: 'Hidden', description: '已禁用服务', url: 'https://hidden.example.com', icon: 'server', category: 'Tools', display: 'card', featured: 0, external: 0, sortOrder: 3, enabled: 0 },
]).run();

/* ---------- navigation 种子：quick 2 条 + footer 1 条启用 + 1 条禁用 ---------- */
db.insert(schema.navigation).values([
  { name: 'GitHub', url: 'https://github.com', icon: null, location: 'quick', sortOrder: 0, enabled: 1, external: 1 },
  { name: 'Status', url: 'https://status.example.com', icon: null, location: 'quick', sortOrder: 1, enabled: 1, external: 1 },
  { name: 'RSS', url: 'https://blog.example.com/rss', icon: null, location: 'footer', sortOrder: 0, enabled: 1, external: 0 },
  { name: 'Old', url: 'https://old.example.com', icon: null, location: 'footer', sortOrder: 1, enabled: 0, external: 0 },
]).run();

/* ---------- themes 种子 ---------- */
db.insert(schema.themes).values({
  name: 'test-theme',
  configJson: JSON.stringify({
    light: { background: '#ffffff', foreground: '#000000', muted: '#666666', accent: '#2563eb', card: '#ffffff', border: 'rgba(0,0,0,0.1)' },
    dark: { background: '#000000', foreground: '#ffffff', muted: '#999999', accent: '#60a5fa', card: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
  }),
  enabled: 1,
}).run();

/* ---------- settings 种子 ---------- */
db.insert(schema.settings).values([
  { key: 'site_name', value: 'Test Portal' },
  { key: 'site_url', value: 'https://test.example.com' },
  { key: 'hero_title', value: 'Test Hero' },
  { key: 'active_theme', value: 'test-theme' },
  { key: 'github_url', value: 'https://github.com/test' },
]).run();

/* ---------- admins 种子 ---------- */
db.insert(schema.admins).values({
  username: 'admin',
  passwordHash: bcrypt.hashSync('test-password-123', 10),
}).run();
