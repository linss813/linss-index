/**
 * 公开项目列表 API
 * GET /api/projects — 返回全部已启用的项目（按 sort_order 排序）
 * 无需认证
 */
import type { APIRoute } from 'astro';
import { getProjects } from '../../lib/queries';

export const GET: APIRoute = async () => {
  const projects = getProjects();
  return new Response(JSON.stringify(projects), {
    headers: { 'Content-Type': 'application/json' },
  });
};
