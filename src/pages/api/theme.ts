/**
 * 公开主题 API
 * GET /api/theme — 返回当前激活主题的色板配置
 * 无需认证
 */
import type { APIRoute } from 'astro';
import { getActiveTheme, getAppearance } from '../../lib/queries';

export const GET: APIRoute = async () => {
  const theme = getActiveTheme();
  const appearance = getAppearance();
  return new Response(JSON.stringify({
    name: theme.name,
    config: theme.config,
    accent: appearance.accent,
    themeMode: appearance.themeMode,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
