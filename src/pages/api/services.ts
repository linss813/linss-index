/**
 * 公开服务列表 API
 * GET /api/services — 返回全部已启用的服务（按 sort_order 排序）
 * 无需认证
 */
import type { APIRoute } from 'astro';
import { getServices } from '../../lib/queries';

export const GET: APIRoute = async () => {
  const services = getServices();
  return new Response(JSON.stringify(services), {
    headers: { 'Content-Type': 'application/json' },
  });
};
