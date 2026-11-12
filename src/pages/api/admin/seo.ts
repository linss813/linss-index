/**
 * SEO 配置 API
 * GET  /api/admin/seo  — 获取全部 SEO 配置（key-value 对）
 * PUT  /api/admin/seo  — 批量更新 SEO 配置
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';

/** 允许修改的 SEO 配置项 key 白名单 */
const ALLOWED_KEYS = new Set([
  'title',
  'description',
  'keywords',
  'canonical',
  'og_title',
  'og_description',
  'og_image',
]);

const optionalHttpUrl = z.union([
  z.literal(''),
  z.url().refine((value) => /^https?:\/\//i.test(value), 'URL 必须使用 http 或 https'),
]);

const seoValueSchemas: Record<string, z.ZodType<string>> = {
  title: z.string().max(120),
  description: z.string().max(500),
  keywords: z.string().max(500),
  canonical: optionalHttpUrl,
  og_title: z.string().max(120),
  og_description: z.string().max(500),
  og_image: optionalHttpUrl,
};

/**
 * 获取全部 SEO 配置
 * 返回 key-value 映射的 JSON 对象
 */
export const GET: APIRoute = async () => {
  // 查询 seo 表全部记录
  const rows = db.select().from(schema.seo).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** 更新 schema：仅接受白名单中的 SEO key，值必须为字符串 */
const updateSchema = z
  .record(z.string(), z.string())
  .refine(
    (obj) => Object.keys(obj).every((k) => ALLOWED_KEYS.has(k)),
    { message: '包含不允许的 SEO 配置项' }
  );

/**
 * 批量更新 SEO 配置
 * 接收 { title, description, keywords, canonical, og_title, og_description, og_image }
 * 每次更新后清除缓存并记录管理员操作日志
 */
export const PUT: APIRoute = async ({ request, session, clientAddress }) => {
  // 校验管理员登录状态
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 解析请求体 JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 校验参数合法性
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? '参数错误' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const updates = parsed.data;
  for (const [key, value] of Object.entries(updates)) {
    const result = seoValueSchemas[key]?.safeParse(value);
    if (!result?.success) {
      return new Response(JSON.stringify({ error: `${key}: ${result?.error.issues[0]?.message ?? '参数错误'}` }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  const now = new Date().toISOString();

  // 整批 SEO 配置原子提交，避免中途失败留下部分新、部分旧的状态。
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(updates)) {
      const existing = tx.select().from(schema.seo).where(eq(schema.seo.key, key)).get();
      if (existing) {
        tx.update(schema.seo)
          .set({ value, updatedAt: now })
          .where(eq(schema.seo.key, key))
          .run();
      } else {
        tx.insert(schema.seo).values({ key, value }).run();
      }
    }
  });

  // 清除查询缓存，使前台立即生效
  clearCache();
  // 记录管理员操作日志
  logAction('update', 'seo', null, JSON.stringify(Object.keys(updates)), clientAddress);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
