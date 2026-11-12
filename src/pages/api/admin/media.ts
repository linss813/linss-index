import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/auth';
import { envConfig } from '../../../lib/env';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { loadImageProcessor } from '../../../lib/watermark';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
function fileTypeFromBuffer(b: Buffer) {
  if (b.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: 'image/png', ext: 'png' };
  if (['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString()))
    return { mime: 'image/gif', ext: 'gif' };
  if (
    b.subarray(0, 4).toString() === 'RIFF' &&
    b.subarray(8, 12).toString() === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}
export const GET: APIRoute = async (ctx) => {
  if (!(await requireAuth(ctx))) return new Response(null, { status: 401 });
  let files: string[] = [];
  try {
    files = (await readdir(envConfig.uploadDir))
      .filter((name) => /^media-[\w-]+\.(webp|png|jpg|gif)$/.test(name))
      .reverse()
      .slice(0, 100);
  } catch {}
  return Response.json(
    files.map((name) => ({ url: `/uploads/${name}`, name })),
  );
};
export const POST: APIRoute = async (ctx) => {
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  if (!(await requireAuth(ctx))) return json({ error: '未登录' }, 401);
  if (ctx.request.headers.get('origin') !== ctx.url.origin)
    return json({ error: '请求来源无效' }, 403);
  try {
    const form = await ctx.request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > envConfig.maxUploadSize)
      return json({ error: '请选择大小合规的图片' }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = fileTypeFromBuffer(bytes);
    if (
      !type ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
        type.mime,
      )
    )
      return json({ error: '只支持JPEG、PNG、WebP、GIF图片' }, 400);
    const processor = await loadImageProcessor();
    if (!processor) return json({ error: '服务器图片处理暂不可用' }, 503);
    const clean = await processor
      .sharp(bytes, { limitInputPixels: 40000000, animated: true })
      .rotate()
      .webp({ quality: 88 })
      .toBuffer();
    const name = `media-${randomUUID()}.webp`;
    await mkdir(envConfig.uploadDir, { recursive: true });
    await writeFile(join(envConfig.uploadDir, name), clean);
    return json({ url: `/uploads/${name}` });
  } catch {
    return json({ error: '上传失败，请重试' }, 400);
  }
};
