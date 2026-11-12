/** Public, cached gallery lightbox preview route. */
import type { APIRoute } from 'astro';
import { getPublicPreview } from '../../lib/preview';

export const GET: APIRoute = async ({ params }) => {
  const rawId = params.id ?? '';
  if (!/^\d+$/.test(rawId)) return new Response('Not Found', { status: 404 });

  const buffer = await getPublicPreview(Number(rawId));
  if (!buffer) return new Response('Not Found', { status: 404 });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
