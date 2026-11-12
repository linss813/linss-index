/**
 * Services 管理 API
 * GET    /api/admin/services  — 获取全部服务列表
 * POST   /api/admin/services  — 新增服务
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { clearCache, logAction } from '../../../lib/auth';
import { getSessionAdmin } from '../../../lib/auth';
import { urlSchema } from '../../../lib/validation';

const createSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  description: z.string().default(''),
  url: urlSchema,
  icon: z.string().default('server'),
  category: z.string().default(''),
  display: z.enum(['featured', 'card', 'list']).default('card'),
  featured: z.boolean().default(false),
  external: z.boolean().default(false),
});

export const GET: APIRoute = async () => {
  const rows = db.select().from(schema.services).orderBy(schema.services.sortOrder).all();
  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? '参数错误' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const d = parsed.data;
  const maxOrder = db.select().from(schema.services).all().length;

  const result = db.insert(schema.services).values({
    name: d.name,
    description: d.description,
    url: d.url,
    icon: d.icon,
    category: d.category,
    display: d.display,
    featured: d.featured ? 1 : 0,
    external: d.external ? 1 : 0,
    sortOrder: maxOrder,
    enabled: 1,
  }).returning().get();

  clearCache();
  logAction('create', 'services', result.id, d.name, clientAddress);

  return new Response(JSON.stringify(result), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
