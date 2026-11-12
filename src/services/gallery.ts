/**
 * 相册数据服务层
 * 页面组件统一通过本模块获取相册数据，禁止直接 fetch API 或查询数据库
 * 数据来源变更（API 格式调整、存储迁移）时只修改本文件
 */
import { db, schema } from '../lib/db';
import { and, asc, eq } from 'drizzle-orm';
import type { GalleryAlbum, GalleryItem, PhotoMetadata } from '../types/gallery';
import { filterPublicMetadata, parseMetadataPublicConfig, probeImageDimensions } from '../lib/gallery-meta';
import { configFingerprint, getWatermarkConfig } from '../lib/watermark';
import { thumbnailUrl } from '../lib/thumbnail';
import { previewUrl } from '../lib/preview';
import { existsSync, readFileSync } from 'node:fs';
import { envConfig } from '../lib/env';
import { join } from 'node:path';

/** settings 表中 metadata 公开配置的键名 */
const METADATA_PUBLIC_KEY = 'gallery_metadata_public';

/**
 * 读取 metadata 公开配置（缺失 / 格式错误回退默认：GPS 不公开）
 */
function getMetadataPublicConfig() {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, METADATA_PUBLIC_KEY)).get();
  return parseMetadataPublicConfig(row?.value);
}

/** gallery_photos 查询结果行的类型 */
type PhotoRow = typeof schema.galleryPhotos.$inferSelect;

/**
 * 历史数据尺寸懒补全（幂等，只在「无尺寸 + 本地文件存在」时探测并写回数据库）
 * v2.3.0 及之前的上传数据没有 width/height；首次查询时补齐后，后续无需再读磁盘
 * @param row gallery_photos 表行（可变引用，会直接修改其 width/height/fileSize/mimeType 字段）
 */
function backfillDimensionsIfNeeded(row: PhotoRow): void {
  if (typeof row.width === 'number' && typeof row.height === 'number') return;
  // 仅支持站内本地文件 /uploads/xxx，外部 CDN/图床 URL 不抓
  if (!row.image.startsWith('/uploads/')) return;
  const filePath = join(envConfig.uploadDir, row.image.slice('/uploads/'.length));
  if (!existsSync(filePath)) return;
  try {
    const buffer = readFileSync(filePath);
    const dim = probeImageDimensions(buffer);
    if (dim) {
      row.width = dim.width;
      row.height = dim.height;
      const fileSize = row.fileSize ?? buffer.length;
      const mimeType = row.mimeType ?? null;
      // 写回数据库，下次不再进入这段逻辑
      db.update(schema.galleryPhotos)
        .set({ width: dim.width, height: dim.height, fileSize, mimeType })
        .where(eq(schema.galleryPhotos.id, row.id))
        .run();
      row.fileSize = fileSize;
      row.mimeType = mimeType;
    }
  } catch {
    /* 读取失败 / 探测失败：静默跳过，下次有机会再尝试 */
  }
}

/**
 * 数据库行 → GalleryItem 视图转换（含 metadata 公开过滤）
 * @param row gallery_photos 表行
 * @param publicConfig metadata 公开配置
 * @param wmFingerprint 当前水印配置指纹（仅前台公开查询传入；水印与缩略图 URL 追加 ?v=指纹，
 *                      配置变更后浏览器强制重新拉取，避免 immutable 长缓存返回旧图）
 * @returns 前台展示用的图片数据（可空字段仅在有意义时保留）
 */
function toGalleryItem(
  row: PhotoRow,
  publicConfig: ReturnType<typeof getMetadataPublicConfig>,
  wmFingerprint?: string
): GalleryItem {
  // 历史数据补全尺寸（首次查询时读本地文件，之后走数据库缓存）
  backfillDimensionsIfNeeded(row);
  /** 数据库 metadata JSON → 对象（解析失败按空处理） */
  let meta: PhotoMetadata | null = null;
  try {
    meta = row.metadata ? (JSON.parse(row.metadata) as PhotoMetadata) : null;
  } catch {
    meta = null;
  }
  // 水印处理：前台公开查询时，加水印的本地照片 image 替换为 /watermarked/:id 路由
  // 原图 /uploads/ 路径不下发，右键保存 / 下载拿到的均为带水印版本（防盗图）
  const isWatermarked = !!wmFingerprint && row.watermarked === 1 && row.image.startsWith('/uploads/');
  const isLocal = row.image.startsWith('/uploads/');
  const item: GalleryItem = {
    id: String(row.id),
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    image: isWatermarked ? `/watermarked/${row.id}?v=${wmFingerprint}` : row.image,
    // 已保存的显式缩略图优先；本地上传但没有缩略图的历史数据统一走
    // 按需生成的 /thumbnails/:id，不再回退下载完整原图。
    thumbnail: row.thumbnail ?? (isLocal ? thumbnailUrl(row, wmFingerprint) : undefined),
    // 灯箱使用屏幕尺寸 WebP，避免为了显示一屏内容下载数 MB 原图。
    // image 仍保留给明确的“查看/下载原图”操作。
    preview: isLocal ? previewUrl(row, wmFingerprint) : undefined,
    albumId: row.albumId != null ? String(row.albumId) : undefined,
    category: row.category ?? undefined,
    date: row.date ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    fileSize: row.fileSize ?? undefined,
    mimeType: row.mimeType ?? undefined,
    takenAt: row.takenAt ?? undefined,
    watermarked: row.watermarked === 1,
    sortOrder: row.sortOrder,
    published: row.published === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  // 公开 metadata 按配置过滤后仅保留允许字段（GPS 未允许时绝不下发）
  const publicMeta = filterPublicMetadata(meta, publicConfig);
  if (Object.keys(publicMeta).length > 0) item.metadata = publicMeta;
  return item;
}

/**
 * 获取公开相册数据（仅 published，按 sortOrder 升序）
 * @param albumId 可选相册过滤（仅返回该相册下的公开照片）
 * @returns 公开展示的照片列表
 */
export async function getGallery(albumId?: number): Promise<GalleryItem[]> {
  const publicConfig = getMetadataPublicConfig();
  const where = albumId != null
    ? and(eq(schema.galleryPhotos.published, 1), eq(schema.galleryPhotos.albumId, albumId))
    : eq(schema.galleryPhotos.published, 1);
  const rows = db
    .select()
    .from(schema.galleryPhotos)
    .where(where)
    .orderBy(asc(schema.galleryPhotos.sortOrder), asc(schema.galleryPhotos.id))
    .all();

  // 前台公开查询：加水印照片替换为水印版本路由（原图路径不暴露）
  // 水印配置指纹随 URL 下发，配置变更后浏览器缓存自动失效
  const wmConfig = getWatermarkConfig();
  const wmFp = wmConfig.image ? configFingerprint(wmConfig) : undefined;
  return rows.map((row) => toGalleryItem(row, publicConfig, wmFp));
}

/**
 * 获取全部相册数据（含未发布，供后台管理使用）
 * @returns 全部照片列表（按 sortOrder 升序，metadata 不做公开过滤）
 */
export async function getAllGallery(): Promise<GalleryItem[]> {
  const rows = db
    .select()
    .from(schema.galleryPhotos)
    .orderBy(asc(schema.galleryPhotos.sortOrder), asc(schema.galleryPhotos.id))
    .all();

  return rows.map((row) => toGalleryItem(row, {
    camera: true, lens: true, focalLength: true, aperture: true, shutterSpeed: true,
    iso: true, takenAt: true, dimensions: true, fileSize: true, location: true,
  }));
}

/**
 * 获取公开相册分组列表（仅 published，含公开照片计数，按 sortOrder 升序）
 * @returns 相册列表
 */
export async function getGalleryAlbums(): Promise<GalleryAlbum[]> {
  const rows = db
    .select()
    .from(schema.galleryAlbums)
    .where(eq(schema.galleryAlbums.published, 1))
    .orderBy(asc(schema.galleryAlbums.sortOrder), asc(schema.galleryAlbums.id))
    .all();

  // 聚合每个相册的公开照片数
  const counts = db
    .select({ albumId: schema.galleryPhotos.albumId })
    .from(schema.galleryPhotos)
    .where(eq(schema.galleryPhotos.published, 1))
    .all();
  const countMap = new Map<number, number>();
  for (const c of counts) {
    if (c.albumId != null) countMap.set(c.albumId, (countMap.get(c.albumId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    description: row.description ?? undefined,
    cover: row.cover ?? undefined,
    sortOrder: row.sortOrder,
    published: row.published === 1,
    photoCount: countMap.get(row.id) ?? 0,
  }));
}

/**
 * 获取全部相册分组（含未发布，供后台管理使用）
 * @returns 相册列表（附全部照片计数）
 */
export async function getAllGalleryAlbums(): Promise<GalleryAlbum[]> {
  const rows = db
    .select()
    .from(schema.galleryAlbums)
    .orderBy(asc(schema.galleryAlbums.sortOrder), asc(schema.galleryAlbums.id))
    .all();

  const counts = db
    .select({ albumId: schema.galleryPhotos.albumId })
    .from(schema.galleryPhotos)
    .all();
  const countMap = new Map<number, number>();
  for (const c of counts) {
    if (c.albumId != null) countMap.set(c.albumId, (countMap.get(c.albumId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    description: row.description ?? undefined,
    cover: row.cover ?? undefined,
    sortOrder: row.sortOrder,
    published: row.published === 1,
    photoCount: countMap.get(row.id) ?? 0,
  }));
}
