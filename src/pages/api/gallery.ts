/**
 * 公开相册 API
 * GET /api/gallery?album={id} — 返回已发布的相册照片列表（可按相册过滤，公开访问无需登录）
 * 响应格式：{ data: GalleryItem[] }（metadata 已按公开配置过滤，敏感字段不会下发）
 */
import type { APIRoute } from 'astro';
import { getGallery } from '../../services/gallery';

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ url }) => {
  // 相册过滤参数：正整数有效，其余按全部处理
  const albumParam = url.searchParams.get('album');
  const albumId = albumParam && /^\d+$/.test(albumParam) ? parseInt(albumParam, 10) : undefined;
  const data = await getGallery(albumId && albumId > 0 ? albumId : undefined);
  return json({ data });
};
