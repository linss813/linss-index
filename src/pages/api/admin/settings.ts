/**
 * 网站基础设置 API
 * GET  /api/admin/settings  — 获取全部设置项
 * PUT  /api/admin/settings  — 批量更新设置项
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { validateAppearanceJson } from '../../../lib/config-validation';
import { homeOrderSchema } from '../../../lib/home-layout';
import { DEFAULT_METADATA_PUBLIC } from '../../../types/gallery';

/** 允许修改的设置项 key 白名单 */
const ALLOWED_KEYS = new Set([
  'site_name',
  'site_title',
  'site_description',
  'site_url',
  'hero_title',
  'hero_subtitle',
  'hero_description',
  'section_featured_title',
  'section_other_title',
  'footer_copyright',
  'footer_year',
  'footer_built_with',
  'footer_built_with_url',
  'github_url',
  'active_theme',
  'theme_mode',
  'layout_mode',
  'appearance',
  'gallery_description',
  'seo_gallery_title',
  'seo_gallery_description',
  'gallery_metadata_public',
  'blog_default_cover',
  'home_module_order',
]);

const shortTextKeys = new Set([
  'site_name',
  'site_title',
  'hero_title',
  'hero_subtitle',
  'section_featured_title',
  'section_other_title',
  'footer_copyright',
  'footer_built_with',
  'gallery_description',
  'seo_gallery_title',
]);
const longTextKeys = new Set([
  'site_description',
  'hero_description',
  'seo_gallery_description',
]);
const urlKeys = new Set(['site_url', 'footer_built_with_url', 'github_url']);
const imageUrlKeys = new Set(['blog_default_cover']);
const httpUrlSchema = z
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'URL 必须使用 http 或 https');
const optionalHttpUrlSchema = z.union([z.literal(''), httpUrlSchema]);
const metadataPublicSchema = z
  .object({
    camera: z.boolean(),
    lens: z.boolean(),
    focalLength: z.boolean(),
    aperture: z.boolean(),
    shutterSpeed: z.boolean(),
    iso: z.boolean(),
    takenAt: z.boolean(),
    dimensions: z.boolean(),
    fileSize: z.boolean(),
    location: z.boolean(),
  })
  .partial()
  .strict();

export const GET: APIRoute = async () => {
  const rows = db.select().from(schema.settings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** 更新外层结构：具体值由 key 对应的 schema 继续校验。 */
const updateSchema = z
  .record(z.string(), z.string())
  .refine((obj) => Object.keys(obj).every((k) => ALLOWED_KEYS.has(k)), {
    message: '包含不允许的设置项',
  });

function validateSettingValue(
  key: string,
  value: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (key === 'home_module_order') {
    try {
      const result = homeOrderSchema.safeParse(JSON.parse(value));
      return result.success
        ? { ok: true, value: JSON.stringify(result.data) }
        : { ok: false, error: '首页排序须包含全部模块，不能重复' };
    } catch {
      return { ok: false, error: '首页排序格式错误' };
    }
  }
  if (shortTextKeys.has(key)) {
    return value.length <= 200
      ? { ok: true, value }
      : { ok: false, error: `${key} 最多 200 个字符` };
  }
  if (longTextKeys.has(key)) {
    return value.length <= 1_000
      ? { ok: true, value }
      : { ok: false, error: `${key} 最多 1000 个字符` };
  }
  if (urlKeys.has(key)) {
    const result = optionalHttpUrlSchema.safeParse(value);
    return result.success
      ? { ok: true, value: result.data }
      : { ok: false, error: `${key}: ${result.error.issues[0]?.message}` };
  }
  if (imageUrlKeys.has(key)) {
    if (value === '' || value.startsWith('/'))
      return value.length <= 500
        ? { ok: true, value }
        : { ok: false, error: `${key} 最多 500 个字符` };
    const result = httpUrlSchema.safeParse(value);
    return result.success
      ? { ok: true, value: result.data }
      : { ok: false, error: `${key}: 请输入站内路径或 HTTP(S) URL` };
  }
  if (key === 'footer_year') {
    return /^(?:19|20|21)\d{2}$/.test(value)
      ? { ok: true, value }
      : { ok: false, error: 'footer_year 必须是 1900-2199 之间的四位年份' };
  }
  if (key === 'active_theme') {
    return /^[A-Za-z0-9_-]{1,64}$/.test(value)
      ? { ok: true, value }
      : { ok: false, error: 'active_theme 格式不合法' };
  }
  if (key === 'theme_mode') {
    return ['system', 'light', 'dark'].includes(value)
      ? { ok: true, value }
      : { ok: false, error: 'theme_mode 不合法' };
  }
  if (key === 'layout_mode') {
    return ['grid', 'list', 'mixed'].includes(value)
      ? { ok: true, value }
      : { ok: false, error: 'layout_mode 不合法' };
  }
  if (key === 'appearance') {
    const result = validateAppearanceJson(value);
    return result.success
      ? { ok: true, value: result.value }
      : { ok: false, error: result.error };
  }
  if (key === 'gallery_metadata_public') {
    try {
      const result = metadataPublicSchema.safeParse(JSON.parse(value));
      if (!result.success)
        return {
          ok: false,
          error: `gallery_metadata_public: ${result.error.issues[0]?.message}`,
        };
      return {
        ok: true,
        value: JSON.stringify({ ...DEFAULT_METADATA_PUBLIC, ...result.data }),
      };
    } catch {
      return { ok: false, error: 'gallery_metadata_public 必须是合法 JSON' };
    }
  }
  return { ok: false, error: `不支持的设置项：${key}` };
}

export const PUT: APIRoute = async ({ request, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? '参数错误' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    const result = validateSettingValue(key, value);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    updates[key] = result.value;
  }
  const now = new Date().toISOString();

  // 整批设置在同一事务中提交，任何一项失败都不会留下半套配置。
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(updates)) {
      const existing = tx
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, key))
        .get();
      if (existing) {
        tx.update(schema.settings)
          .set({ value, updatedAt: now })
          .where(eq(schema.settings.key, key))
          .run();
      } else {
        tx.insert(schema.settings).values({ key, value }).run();
      }
    }
  });

  clearCache();
  logAction(
    'update',
    'settings',
    null,
    JSON.stringify(Object.keys(updates)),
    clientAddress,
  );

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
