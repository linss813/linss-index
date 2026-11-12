/**
 * Projects 单条管理 API
 * PUT    /api/admin/projects/:id  — 修改项目（支持部分更新）
 * DELETE /api/admin/projects/:id  — 删除项目
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../../lib/auth';
import { urlSchema } from '../../../../lib/validation';

/** 可选 URL：允许空字符串或不传，空字符串视为未填写 */
const optionalUrlSchema = urlSchema.optional().or(z.literal(''));

/** 更新项目校验 schema（所有字段可选，支持部分更新） */
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  cover: z.string().optional(),
  techStack: z.string().optional(),
  githubUrl: optionalUrlSchema,
  demoUrl: optionalUrlSchema,
  status: z.enum(['active', 'archived', 'draft']).optional(),
  sortOrder: z.number().optional(),
  enabled: z.boolean().optional(),
});

/**
 * 将 Drizzle 返回的 camelCase 行转换为 snake_case
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

export const PUT: APIRoute = async ({ request, params, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 解析路径参数 id
  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: '无效 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 解析请求体
  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 参数校验
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? '参数错误' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const d = parsed.data;
  // 构造更新数据：只更新已传入的字段
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (d.name !== undefined) updateData.name = d.name;
  if (d.description !== undefined) updateData.description = d.description;
  if (d.cover !== undefined) updateData.cover = d.cover || null;
  if (d.techStack !== undefined) updateData.techStack = d.techStack || null;
  if (d.githubUrl !== undefined) updateData.githubUrl = d.githubUrl || null;
  if (d.demoUrl !== undefined) updateData.demoUrl = d.demoUrl || null;
  if (d.status !== undefined) updateData.status = d.status;
  if (d.sortOrder !== undefined) updateData.sortOrder = d.sortOrder;
  if (d.enabled !== undefined) updateData.enabled = d.enabled ? 1 : 0;

  db.update(schema.projects).set(updateData).where(eq(schema.projects.id, id)).run();
  clearCache();
  logAction('update', 'projects', id, JSON.stringify(d), clientAddress);

  // 返回更新后的记录
  const updated = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  return new Response(JSON.stringify(toSnake(updated)), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, session, clientAddress }) => {
  // 鉴权：未登录拒绝
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 解析路径参数 id
  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: '无效 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
  clearCache();
  logAction('delete', 'projects', id, null, clientAddress);

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
