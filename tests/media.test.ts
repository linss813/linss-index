import { describe, it, expect } from 'vitest';
import { POST, GET } from '../src/pages/api/admin/media';
import sharp from 'sharp';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { envConfig } from '../src/lib/env';
function context(
  form: FormData,
  authenticated = true,
  origin = 'http://localhost',
) {
  return {
    url: new URL('http://localhost/api/admin/media'),
    request: new Request('http://localhost/api/admin/media', {
      method: 'POST',
      headers: { origin },
      body: form,
    }),
    session: {
      get: async () => (authenticated ? { id: 1, username: 'admin' } : null),
    },
  } as any;
}
describe('shared image media', () => {
  it('requires a same-origin administrator and validates the actual image bytes', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File(['not an image'], 'fake.png', { type: 'image/png' }),
    );
    expect((await POST(context(form, false))).status).toBe(401);
    expect(
      (await POST(context(form, true, 'https://other.example'))).status,
    ).toBe(403);
    expect((await POST(context(form))).status).toBe(400);
  });
  it('decodes, normalizes and stores image media with a safe generated URL', async () => {
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#789456' },
    })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set(
      'file',
      new File([new Uint8Array(bytes)], '../../private.jpg', {
        type: 'image/jpeg',
      }),
    );
    const response = await POST(context(form));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.url).toMatch(/^\/uploads\/media-[a-f0-9-]+\.webp$/);
    const path = join(envConfig.uploadDir, data.url.split('/').pop());
    try {
      const metadata = await sharp(await readFile(path)).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(8);
      expect(metadata.exif).toBeUndefined();
      const library = await (await GET(context(new FormData()))).json();
      expect(library.some((file: any) => file.url === data.url)).toBe(true);
    } finally {
      await unlink(path);
    }
  });
});
