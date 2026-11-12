/**
 * 后台访问路径管理 API
 * GET /api/admin/admin-path — 获取当前后台路径
 * PUT /api/admin/admin-path — 修改后台路径（校验格式与保留字，写入 settings）
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../lib/db';
import { eq } from 'drizzle-orm';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import {
  getAdminBasePath,
  normalizeAdminPath,
  adminUrl,
  ADMIN_PATH_SETTING_KEY,
  DEFAULT_ADMIN_PATH,
} from '../../../lib/admin-path';

/** 统一返回 JSON */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ session }) => {
  const admin = await getSessionAdmin({ session } as never);
  if (!admin) return json({ error: '未登录' }, 401);
  const current = getAdminBasePath();
  return json({ path: current, isDefault: current === DEFAULT_ADMIN_PATH, url: adminUrl('') });
};

const updateSchema = z.object({
  path: z.string().max(64),
});

export const PUT: APIRoute = async ({ request, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as never);
  if (!admin) return json({ error: '未登录' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: '参数错误' }, 400);

  // 格式与保留字校验
  const result = normalizeAdminPath(parsed.data.path);
  if (!result.ok) return json({ error: result.error }, 400);

  const newValue = result.value;
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, ADMIN_PATH_SETTING_KEY))
    .get();

  if (existing) {
    db.update(schema.settings)
      .set({ value: newValue, updatedAt: now })
      .where(eq(schema.settings.key, ADMIN_PATH_SETTING_KEY))
      .run();
  } else {
    db.insert(schema.settings).values({ key: ADMIN_PATH_SETTING_KEY, value: newValue }).run();
  }

  clearCache();
  logAction('update', 'admin_path', null, `后台路径改为 /${newValue}`, clientAddress);

  return json({ success: true, path: newValue, isDefault: newValue === DEFAULT_ADMIN_PATH, url: adminUrl('') });
};
