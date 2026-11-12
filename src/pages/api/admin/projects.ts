/**
 * Projects 管理 API
 * GET    /api/admin/projects  — 获取全部项目列表（按 sort_order 排序）
 * POST   /api/admin/projects  — 新增项目
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { urlSchema } from '../../../lib/validation';

/** 可选 URL：允许空字符串或不传，空字符串视为未填写 */
const optionalUrlSchema = urlSchema.optional().or(z.literal(''));

/** 新增项目校验 schema */
const createSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  description: z.string().default(''),
  cover: z.string().optional(),
  techStack: z.string().optional(),
  githubUrl: optionalUrlSchema,
  demoUrl: optionalUrlSchema,
  status: z.enum(['active', 'archived', 'draft']).default('active'),
});

/**
 * 将 Drizzle 返回的 camelCase 行转换为 snake_case
 * 数据库字段名为 snake_case（tech_stack、github_url、demo_url 等）
 * @param row Drizzle 查询返回的行对象（camelCase 属性）
 * @returns snake_case 字段的对象
 */
function toSnake(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cover: row.cover,
    tech_stack: row.techStack,
    github_url: row.githubUrl,
    demo_url: row.demoUrl,
    status: row.status,
    sort_order: row.sortOrder,
    enabled: row.enabled,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export const GET: APIRoute = async () => {
  // 按 sort_order 升序返回全部项目
  const rows = db.select().from(schema.projects).orderBy(schema.projects.sortOrder).all();
  const data = rows.map(toSnake);
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 解析请求体
  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 参数校验
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? '参数错误' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const d = parsed.data;
  // 新项目排在末尾，sort_order 取当前数量
  const maxOrder = db.select().from(schema.projects).all().length;

  const result = db.insert(schema.projects).values({
    name: d.name,
    description: d.description,
    cover: d.cover || null,
    techStack: d.techStack || null,
    githubUrl: d.githubUrl || null,
    demoUrl: d.demoUrl || null,
    status: d.status,
    sortOrder: maxOrder,
    enabled: 1,
  }).returning().get();

  clearCache();
  logAction('create', 'projects', result.id, d.name, clientAddress);

  return new Response(JSON.stringify(toSnake(result)), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
