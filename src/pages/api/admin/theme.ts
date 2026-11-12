/**
 * Theme 主题管理 API
 * GET  /api/admin/theme  — 获取全部主题 + 当前激活主题名
 * PUT  /api/admin/theme  — 切换激活主题 / 更新主题色板
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';
import { clearCache, getSessionAdmin, logAction } from '../../../lib/auth';
import { themeDefinitionSchema } from '../../../lib/config-validation';

/** 切换激活主题请求体校验 */
const activeThemeSchema = z.object({
  activeTheme: z.string().min(1, '主题名不能为空'),
});

/** 更新主题色板请求体校验 */
const updateConfigSchema = z.object({
  themeName: z.string().min(1, '主题名不能为空'),
  config: themeDefinitionSchema,
});

/**
 * JSON 响应快捷函数
 * @param data 响应数据
 * @param status HTTP 状态码
 */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET：获取全部主题列表 + 当前激活主题名
 * 返回 { themes: [{id, name, configJson, enabled}], activeTheme: string }
 */
export const GET: APIRoute = async () => {
  const themeRows = db.select().from(schema.themes).all();
  const settingRow = db.select().from(schema.settings)
    .where(eq(schema.settings.key, 'active_theme'))
    .get();

  return json({
    themes: themeRows.map((t) => ({
      id: t.id,
      name: t.name,
      configJson: t.configJson,
      enabled: t.enabled,
    })),
    activeTheme: settingRow?.value ?? 'default',
  });
};

/**
 * PUT：切换激活主题 或 更新主题色板
 * - { activeTheme: 'default' }                    切换激活主题（更新 settings 表 active_theme 键）
 * - { themeName: 'default', config: { light, dark } } 更新主题色板（themes 表 config_json）
 * @param request 请求对象
 * @param session Astro 会话
 * @param clientAddress 客户端 IP
 */
export const PUT: APIRoute = async ({ request, session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (!admin) {
    return json({ error: '未登录' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const now = new Date().toISOString();

  // 操作 a：切换激活主题
  const activeParsed = activeThemeSchema.safeParse(body);
  if (activeParsed.success) {
    const themeName = activeParsed.data.activeTheme;
    // 校验主题存在
    const exists = db.select().from(schema.themes)
      .where(eq(schema.themes.name, themeName))
      .get();
    if (!exists) {
      return json({ error: '主题不存在' }, 400);
    }

    // 更新 settings 表 active_theme 键（存在则更新，不存在则插入）
    const existing = db.select().from(schema.settings)
      .where(eq(schema.settings.key, 'active_theme'))
      .get();
    if (existing) {
      db.update(schema.settings)
        .set({ value: themeName, updatedAt: now })
        .where(eq(schema.settings.key, 'active_theme'))
        .run();
    } else {
      db.insert(schema.settings)
        .values({ key: 'active_theme', value: themeName })
        .run();
    }

    clearCache();
    logAction('update', 'settings', null, `切换激活主题: ${themeName}`, clientAddress);

    return json({ success: true, activeTheme: themeName });
  }

  // 操作 b：更新主题色板
  const configParsed = updateConfigSchema.safeParse(body);
  if (configParsed.success) {
    const { themeName, config } = configParsed.data;
    const exists = db.select().from(schema.themes)
      .where(eq(schema.themes.name, themeName))
      .get();
    if (!exists) {
      return json({ error: '主题不存在' }, 400);
    }

    db.update(schema.themes)
      .set({ configJson: JSON.stringify(config), updatedAt: now })
      .where(eq(schema.themes.name, themeName))
      .run();

    clearCache();
    logAction('update', 'themes', exists.id, `更新色板: ${themeName}`, clientAddress);

    return json({ success: true });
  }

  // 两种操作均不匹配
  const configResult = updateConfigSchema.safeParse(body);
  const issue = configResult.error?.issues[0];
  return json({
    error: issue
      ? `${issue.path.join('.') || 'config'}: ${issue.message}`
      : '参数错误：需提供 activeTheme 或 { themeName, config }',
  }, 400);
};
