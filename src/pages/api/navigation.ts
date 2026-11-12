/**
 * 公开导航链接 API
 * GET /api/navigation?location=quick|header|footer
 * 无需认证
 */
import type { APIRoute } from 'astro';
import { getNavigation } from '../../lib/queries';

export const GET: APIRoute = async ({ url }) => {
  const location = url.searchParams.get('location') as 'header' | 'quick' | 'footer' | null;
  const links = location ? getNavigation(location) : {
    header: getNavigation('header'),
    quick: getNavigation('quick'),
    footer: getNavigation('footer'),
  };
  return new Response(JSON.stringify(links), {
    headers: { 'Content-Type': 'application/json' },
  });
};
