/**
 * Public gallery lightbox preview pipeline.
 *
 * The lightbox should not download an 8–10 MB original just to fill a screen.
 * This module creates a display-sized WebP on first request and caches it on
 * disk. The original URL remains available for the explicit open/download
 * actions.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { envConfig } from './env';
import { applyWatermark, configFingerprint, getWatermarkConfig, loadImageProcessor } from './watermark';

/** 1920px covers common desktop/phone viewports without carrying full camera resolution. */
export const PREVIEW_MAX_EDGE = 1920;
export const PREVIEW_CACHE_DIR = join(envConfig.uploadDir, 'previews');

type PhotoRow = typeof schema.galleryPhotos.$inferSelect;
type PreviewVersionRow = Pick<PhotoRow, 'id' | 'image' | 'updatedAt' | 'fileSize' | 'watermarked'>;

/** Versioned URLs make year-long browser caching safe across edits/config changes. */
export function previewVersion(row: PreviewVersionRow, watermarkFingerprint?: string): string {
  const watermarkPart = row.watermarked === 1 && watermarkFingerprint ? watermarkFingerprint : 'plain';
  return createHash('sha256')
    .update(`preview:v1:${row.id}:${row.image}:${row.updatedAt}:${row.fileSize ?? ''}:${watermarkPart}:${PREVIEW_MAX_EDGE}`)
    .digest('hex')
    .slice(0, 16);
}

export function previewUrl(row: PreviewVersionRow, watermarkFingerprint?: string): string {
  return `/previews/${row.id}?v=${previewVersion(row, watermarkFingerprint)}`;
}

function cachePath(photoId: number, version: string): string {
  return join(PREVIEW_CACHE_DIR, `${photoId}_${version}.webp`);
}

/** Generate or read a display-sized preview for a published local photo. */
export async function getPublicPreview(photoId: number): Promise<Buffer | null> {
  const row = db.select().from(schema.galleryPhotos).where(eq(schema.galleryPhotos.id, photoId)).get();
  if (!row || row.published !== 1 || !row.image.startsWith('/uploads/')) return null;

  const watermarkConfig = getWatermarkConfig();
  const watermarkFingerprint = watermarkConfig.image ? configFingerprint(watermarkConfig) : undefined;
  const version = previewVersion(row, watermarkFingerprint);
  const cached = cachePath(photoId, version);
  if (existsSync(cached)) {
    try {
      return readFileSync(cached);
    } catch {
      // Interrupted writes or concurrent cleanup simply regenerate the file.
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
    // Resize before watermarking so the expensive composite runs on the much
    // smaller display bitmap while retaining the configured relative scale.
    let output: Buffer<ArrayBufferLike> = Buffer.from(await processor.sharp(original)
      .rotate()
      .resize({
        width: PREVIEW_MAX_EDGE,
        height: PREVIEW_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4 })
      .toBuffer());

    if (row.watermarked === 1 && watermarkConfig.image) {
      const marked = await applyWatermark(output, 'image/webp', watermarkConfig);
      if (marked) output = Buffer.from(marked.buffer);
    }

    const preview = Buffer.from(await processor.sharp(output)
      .webp({ quality: 82, effort: 4 })
      .toBuffer());
    try {
      mkdirSync(PREVIEW_CACHE_DIR, { recursive: true });
      writeFileSync(cached, preview);
    } catch {
      // A cache failure should not fail the image request itself.
    }
    return preview;
  } catch {
    return null;
  }
}

/** Remove derived previews after a photo or watermark setting changes. */
export function invalidatePreviewCache(photoId?: number): void {
  try {
    if (!existsSync(PREVIEW_CACHE_DIR)) return;
    const prefix = photoId == null ? '' : `${photoId}_`;
    for (const name of readdirSync(PREVIEW_CACHE_DIR)) {
      if (!prefix || name.startsWith(prefix)) {
        try {
          unlinkSync(join(PREVIEW_CACHE_DIR, name));
        } catch {
          /* Stale versioned derivatives are harmless. */
        }
      }
    }
  } catch {
    /* Cache cleanup must never make a content update fail. */
  }
}
