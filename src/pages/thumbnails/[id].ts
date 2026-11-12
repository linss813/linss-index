/** Public, cached gallery thumbnail route. */
import type { APIRoute } from 'astro';
import { getPublicThumbnail } from '../../lib/thumbnail';

export const GET: APIRoute = async ({ params }) => {
  const rawId = params.id ?? '';
  if (!/^\d+$/.test(rawId)) return new Response('Not Found', { status: 404 });

  const buffer = await getPublicThumbnail(Number(rawId));
  if (!buffer) return new Response('Not Found', { status: 404 });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      // The URL includes source/config version, so this is safe across edits.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
