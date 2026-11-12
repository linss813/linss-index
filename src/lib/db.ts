/**
 * SQLite 数据库连接模块
 * 使用 better-sqlite3 + Drizzle ORM
 * 数据库文件路径通过环境变量 DATABASE_URL 配置
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { envConfig } from './env';
import * as schema from '../db/schema';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** 确保数据库目录存在 */
const dbPath = envConfig.databaseUrl;
const dbDir = dirname(dbPath);
try {
  mkdirSync(dbDir, { recursive: true });
} catch {
  /* 目录已存在或路径为相对路径在当前目录 */
}

/** better-sqlite3 原生连接实例 */
export const sqlite = new Database(dbPath);

/** 启用 WAL 模式，提升并发读性能 */
sqlite.pragma('journal_mode = WAL');
/** 启用外键约束 */
sqlite.pragma('foreign_keys = ON');

/** Drizzle ORM 实例（全应用共用单例） */
export const db = drizzle(sqlite, { schema });

/** 导出所有 schema 供外部使用 */
export { schema };
