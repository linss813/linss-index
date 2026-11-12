/**
 * Drizzle Kit 配置
 * 用于生成和管理数据库 Migration
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data/luen0511-home/database.sqlite',
  },
  verbose: true,
  strict: true,
});
