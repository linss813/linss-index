/**
 * 公开站点设置 API
 * GET /api/settings — 返回站点配置（不含敏感信息）
 * 无需认证
 */
import type { APIRoute } from 'astro';
import { getSiteConfig } from '../../lib/queries';

export const GET: APIRoute = async () => {
  const config = getSiteConfig();
  return new Response(JSON.stringify(config), {
    headers: { 'Content-Type': 'application/json' },
  });
};
