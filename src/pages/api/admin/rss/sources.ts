import type { APIRoute } from 'astro';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { getSessionAdmin, logAction } from '../../../../lib/auth';
import { urlSchema } from '../../../../lib/validation';

const optionalUrl = z.union([z.literal(''), urlSchema]).transform((value) => value || null);
const sourceSchema = z.object({
  name: z.string().trim().min(1, '网站名称不能为空').max(120),
  rssUrl: urlSchema,
  siteUrl: optionalUrl.optional(),
  sitemapUrl: optionalUrl.optional(),
  description: z.string().trim().max(500).default(''),
  icon: optionalUrl.optional(),
  cover: optionalUrl.optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  displayType: z.enum(['primary', 'secondary']).default('secondary'),
  sortOrder: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ session }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  const rows = db.select({
    id: schema.rssSources.id, name: schema.rssSources.name, rssUrl: schema.rssSources.rssUrl,
    siteUrl: schema.rssSources.siteUrl, sitemapUrl: schema.rssSources.sitemapUrl,
    description: schema.rssSources.description, icon: schema.rssSources.icon, cover: schema.rssSources.cover,
    categoryId: schema.rssSources.categoryId, categoryName: schema.rssCategories.name,
    displayType: schema.rssSources.displayType, sortOrder: schema.rssSources.sortOrder,
    enabled: schema.rssSources.enabled, updatedAt: schema.rssSources.updatedAt,
  }).from(schema.rssSources).leftJoin(schema.rssCategories, eq(schema.rssSources.categoryId, schema.rssCategories.id))
    .orderBy(asc(schema.rssSources.sortOrder), asc(schema.rssSources.id)).all();
  return json(rows);
};

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  if (!await getSessionAdmin({ session } as any)) return json({ error: '未登录' }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const parsed = sourceSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  const d = parsed.data;
  try {
    const created = db.transaction((tx) => {
      if (d.displayType === 'primary') tx.update(schema.rssSources).set({ displayType: 'secondary' }).where(eq(schema.rssSources.displayType, 'primary')).run();
      return tx.insert(schema.rssSources).values({
        name: d.name, rssUrl: d.rssUrl, siteUrl: d.siteUrl ?? null, sitemapUrl: d.sitemapUrl ?? null,
        description: d.description, icon: d.icon ?? null, cover: d.cover ?? null,
        categoryId: d.categoryId ?? null, displayType: d.displayType,
        sortOrder: d.sortOrder, enabled: d.enabled ? 1 : 0,
      }).returning().get();
    });
    logAction('create', 'rss_source', created.id, d.name, clientAddress);
    return json(created, 201);
  } catch (error) {
    return json({ error: String(error).includes('UNIQUE') ? 'RSS 地址已存在' : '保存 RSS 源失败' }, 409);
  }
};
