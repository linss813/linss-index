/**
 * 公开相册分组 API
 * GET /api/gallery/albums — 返回已发布的相册列表（含公开照片计数，公开访问无需登录）
 * 响应格式：{ data: GalleryAlbum[] }
 */
import type { APIRoute } from 'astro';
import { getGalleryAlbums } from '../../../services/gallery';

/** 统一返回 JSON 响应 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async () => {
  const data = await getGalleryAlbums();
  return json({ data });
};
