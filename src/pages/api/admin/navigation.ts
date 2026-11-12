/**
 * Navigation 管理 API
 * GET    /api/admin/navigation  — 获取全部导航列表（按 sort_order 排序）
 * POST   /api/admin/navigation  — 新增导航项
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { urlSchema } from '../../../lib/validation';

/** 新增导航项的请求体校验 */
const createSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  url: urlSchema,
  icon: z.string().optional(),
  location: z.enum(['header', 'quick', 'footer']).default('footer'),
  external: z.boolean().default(false),
});

/**
 * GET 处理：返回全部导航列表，按 sortOrder 升序排列
 * @returns JSON 形式的导航数组
 */
export const GET: APIRoute = async () => {
  const rows = db.select().from(schema.navigation).orderBy(schema.navigation.sortOrder).all();
  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/**
 * POST 处理：新增一个导航项
 * @param request  请求对象，包含 JSON 正文
 * @param session  会话信息，用于鉴权
 * @param clientAddress 客户端 IP，用于日志记录
 */
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
  // 新导航项追加到列表末尾
  const maxOrder = db.select().from(schema.navigation).all().length;

  const result = db.insert(schema.navigation).values({
    name: d.name,
    url: d.url,
    icon: d.icon ?? null,
    location: d.location,
    external: d.external ? 1 : 0,
    sortOrder: maxOrder,
    enabled: 1,
  }).returning().get();

  clearCache();
  logAction('create', 'navigation', result.id, d.name, clientAddress);

  return new Response(JSON.stringify(result), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
