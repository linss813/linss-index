/**
 * Public gallery thumbnail pipeline.
 *
 * Original uploads stay untouched. A small WebP derivative is generated on
 * first request and cached on disk, so gallery grids never need to download a
 * multi-megabyte original merely to paint a card.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { envConfig } from './env';
import { applyWatermark, configFingerprint, getWatermarkConfig, loadImageProcessor } from './watermark';

/** Long edge for gallery-card images. Retina screens still look sharp at typical card widths. */
export const THUMBNAIL_MAX_WIDTH = 640;
/** Derived files are private implementation details, served only by /thumbnails/:id. */
export const THUMBNAIL_CACHE_DIR = join(envConfig.uploadDir, 'thumbnails');

type PhotoRow = typeof schema.galleryPhotos.$inferSelect;

/**
 * Version includes every value that can change visible thumbnail bytes. It is
 * emitted into the public URL, making the immutable browser cache safe.
 */
export function thumbnailVersion(row: Pick<PhotoRow, 'id' | 'image' | 'updatedAt' | 'fileSize' | 'watermarked'>, watermarkFingerprint?: string): string {
  const watermarkPart = row.watermarked === 1 && watermarkFingerprint ? watermarkFingerprint : 'plain';
  return createHash('sha256')
    .update(`thumbnail:v1:${row.id}:${row.image}:${row.updatedAt}:${row.fileSize ?? ''}:${watermarkPart}:${THUMBNAIL_MAX_WIDTH}`)
    .digest('hex')
    .slice(0, 16);
}

export function thumbnailUrl(row: Pick<PhotoRow, 'id' | 'image' | 'updatedAt' | 'fileSize' | 'watermarked'>, watermarkFingerprint?: string): string {
  return `/thumbnails/${row.id}?v=${thumbnailVersion(row, watermarkFingerprint)}`;
}

function cachePath(photoId: number, version: string): string {
  return join(THUMBNAIL_CACHE_DIR, `${photoId}_${version}.webp`);
}

/**
 * Generate/read a public thumbnail. This deliberately enforces published
 * status again: route IDs are enumerable and the cache is not public storage.
 */
export async function getPublicThumbnail(photoId: number): Promise<Buffer | null> {
  const row = db.select().from(schema.galleryPhotos).where(eq(schema.galleryPhotos.id, photoId)).get();
  if (!row || row.published !== 1 || !row.image.startsWith('/uploads/')) return null;

  const watermarkConfig = getWatermarkConfig();
  const watermarkFingerprint = watermarkConfig.image ? configFingerprint(watermarkConfig) : undefined;
  const version = thumbnailVersion(row, watermarkFingerprint);
  const cached = cachePath(photoId, version);
  if (existsSync(cached)) {
    try {
      return readFileSync(cached);
    } catch {
      // A concurrent cleanup or interrupted write falls through to regeneration.
    }
  }

  let original: Buffer;
  try {
    original = readFileSync(join(envConfig.uploadDir, row.image.slice('/uploads/'.length)));
  } catch {
    return null;
  }

  const processor = await loadImageProcessor();
  if (!processor) return null;

  try {
    // Resize before watermarking: the mark remains proportionally identical,
    // while the expensive compositing work happens on a much smaller bitmap.
    let input: Buffer<ArrayBufferLike> = Buffer.from(await processor.sharp(original)
      .rotate()
      .resize({ width: THUMBNAIL_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer());

    if (row.watermarked === 1 && watermarkConfig.image) {
      const marked = await applyWatermark(input, 'image/webp', watermarkConfig);
      if (marked) input = Buffer.from(marked.buffer);
    }

    const thumbnail = Buffer.from(await processor.sharp(input)
      .webp({ quality: 72, effort: 4 })
      .toBuffer());
    try {
      mkdirSync(THUMBNAIL_CACHE_DIR, { recursive: true });
      writeFileSync(cached, thumbnail);
    } catch {
      // Serving this request is still useful even if the disk cache is unavailable.
    }
    return thumbnail;
  } catch {
    return null;
  }
}

/** Remove derived thumbnails when their source is deleted or watermark settings change. */
export function invalidateThumbnailCache(photoId?: number): void {
  try {
    if (!existsSync(THUMBNAIL_CACHE_DIR)) return;
    const prefix = photoId == null ? '' : `${photoId}_`;
    for (const name of readdirSync(THUMBNAIL_CACHE_DIR)) {
      if (!prefix || name.startsWith(prefix)) {
        try {
          unlinkSync(join(THUMBNAIL_CACHE_DIR, name));
        } catch {
          /* A stale derivative is harmless; its versioned URL will not be reused. */
        }
      }
    }
  } catch {
    /* Cache cleanup must never make a content update fail. */
  }
}
