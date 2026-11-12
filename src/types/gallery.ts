/**
 * 相册数据结构定义
 * 与存储方案无关（本地 / OpenList / 对象存储 / 图床均适用）
 * 前台 UI 组件只依赖本类型，不直接接触数据库行结构与原始 API 响应
 * 注意：本模块保持零第三方依赖，可安全用于客户端组件
 */

/** 标准 metadata 结构（数据库 metadata JSON 列的规范形态） */
export interface PhotoMetadata {
  /** 相机制造商 + 型号（如 "Sony A7C"） */
  camera?: string;
  /** 镜头（如 "FE 35mm F1.8"） */
  lens?: string;
  /** 焦距（如 "35mm"） */
  focalLength?: string;
  /** 光圈（如 "f/1.8"） */
  aperture?: string;
  /** 快门速度（如 "1/250"） */
  shutterSpeed?: string;
  /** 感光度 */
  iso?: number;
  /** 拍摄时间（EXIF 原始时间，无时区语义，格式 "YYYY-MM-DD HH:mm:ss"） */
  takenAt?: string;
  /** GPS 坐标（敏感字段，仅后台可见，公开展示需配置允许） */
  location?: { latitude: number; longitude: number };
  /** EXIF 方向标记（1-8） */
  orientation?: number;
}

/** Metadata 公开配置（后台可调，存储于 settings 表 key=gallery_metadata_public） */
export interface MetadataPublicConfig {
  camera: boolean;
  lens: boolean;
  focalLength: boolean;
  aperture: boolean;
  shutterSpeed: boolean;
  iso: boolean;
  takenAt: boolean;
  dimensions: boolean;
  fileSize: boolean;
  location: boolean;
}

/** 默认公开配置：常规拍摄参数公开，GPS 位置默认不公开 */
export const DEFAULT_METADATA_PUBLIC: MetadataPublicConfig = {
  camera: true,
  lens: true,
  focalLength: true,
  aperture: true,
  shutterSpeed: true,
  iso: true,
  takenAt: true,
  dimensions: true,
  fileSize: true,
  location: false,
};

/** 水印位置枚举（九宫格五个预设位 + custom 自定义坐标） */
export type WatermarkPosition = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right' | 'custom';

/** 水印配置（存储于 settings 表 key=gallery_watermark 的 JSON） */
export interface WatermarkConfig {
  /** 水印图片地址（站内 /uploads/ 路径，未上传时为空字符串，水印功能自动失效） */
  image: string;
  /** 水印位置（预设位或 custom 自定义） */
  position: WatermarkPosition;
  /** 不透明度（0-100，100 = 完全不透明） */
  opacity: number;
  /** 水印宽度占原图宽度的百分比（5-60） */
  scale: number;
  /** 水印与图片边缘的间距（占图片短边的百分比，0-20） */
  margin: number;
  /** 自定义横坐标（0-100，占可用宽度百分比，仅 position=custom 时参与合成） */
  posX: number;
  /** 自定义纵坐标（0-100，占可用高度百分比，仅 position=custom 时参与合成） */
  posY: number;
}

/** 默认水印配置（右下角、半透明、宽度占 18%、边距 4%） */
export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  image: '',
  position: 'bottom-right',
  opacity: 70,
  scale: 18,
  margin: 4,
  posX: 100,
  posY: 100,
};

/** 水印配置合法位置列表（供校验与 UI 渲染共用） */
export const WATERMARK_POSITIONS: WatermarkPosition[] = [
  'top-left', 'top-right', 'center', 'bottom-left', 'bottom-right', 'custom',
];

/** 预设位置 → 自定义坐标映射（posX/posY 百分比，与后台拖动 UI 共用） */
export const WATERMARK_PRESET_POS: Record<Exclude<WatermarkPosition, 'custom'>, { posX: number; posY: number }> = {
  'top-left': { posX: 0, posY: 0 },
  'top-right': { posX: 100, posY: 0 },
  'center': { posX: 50, posY: 50 },
  'bottom-left': { posX: 0, posY: 100 },
  'bottom-right': { posX: 100, posY: 100 },
};

/**
 * 解析水印配置 JSON（缺失 / 格式错误回退默认值，逐字段钳制合法范围）
 * @param raw settings 表中的 JSON 字符串（可为 undefined）
 * @returns 合法的水印配置对象
 */
export function parseWatermarkConfig(raw: string | undefined | null): WatermarkConfig {
  const base = { ...DEFAULT_WATERMARK_CONFIG };
  if (!raw) return base;
  try {
    const obj = JSON.parse(raw) as Partial<WatermarkConfig>;
    if (typeof obj.image === 'string') base.image = obj.image;
    if (WATERMARK_POSITIONS.includes(obj.position as WatermarkPosition)) base.position = obj.position as WatermarkPosition;
    if (typeof obj.opacity === 'number' && Number.isFinite(obj.opacity)) base.opacity = Math.min(100, Math.max(0, Math.round(obj.opacity)));
    if (typeof obj.scale === 'number' && Number.isFinite(obj.scale)) base.scale = Math.min(60, Math.max(5, Math.round(obj.scale)));
    if (typeof obj.margin === 'number' && Number.isFinite(obj.margin)) base.margin = Math.min(20, Math.max(0, Math.round(obj.margin)));
    if (typeof obj.posX === 'number' && Number.isFinite(obj.posX)) base.posX = Math.min(100, Math.max(0, Math.round(obj.posX)));
    if (typeof obj.posY === 'number' && Number.isFinite(obj.posY)) base.posY = Math.min(100, Math.max(0, Math.round(obj.posY)));
  } catch {
    /* 解析失败回退默认 */
  }
  return base;
}

/** metadata 字段 → 前台显示标签 */
export const METADATA_LABELS: Record<keyof MetadataPublicConfig, string> = {
  camera: 'Camera',
  lens: 'Lens',
  focalLength: 'Focal Length',
  aperture: 'Aperture',
  shutterSpeed: 'Shutter',
  iso: 'ISO',
  takenAt: 'Date',
  dimensions: 'Dimensions',
  fileSize: 'File Size',
  location: 'Location',
};

/** 相册分组（前台展示视图） */
export interface GalleryAlbum {
  /** 相册唯一 ID */
  id: string;
  /** 相册名称 */
  name: string;
  /** 相册描述（可空） */
  description?: string;
  /** 封面图地址（未设置时前端可回退相册内首图缩略图） */
  cover?: string;
  /** 排序值（越小越靠前） */
  sortOrder: number;
  /** 是否公开 */
  published: boolean;
  /** 公开照片数（由 API 聚合提供） */
  photoCount?: number;
}

/** 相册单张照片（前台展示视图） */
export interface GalleryItem {
  /** 图片唯一 ID */
  id: string;
  /** 图片标题（可空） */
  title?: string;
  /** 图片描述（可空） */
  description?: string;
  /** 原图地址（相对路径或完整 HTTPS URL） */
  image: string;
  /** 缩略图地址（可空，未提供时列表直接用原图） */
  thumbnail?: string;
  /** 弹层展示用的屏幕尺寸预览图（可空；原图仍由 image 提供） */
  preview?: string;
  /** 所属相册 ID（可空 = 未分组） */
  albumId?: string;
  /** 分类（可空） */
  category?: string;
  /** 展示日期（如 2026-08-01，可空） */
  date?: string;
  /** 原图宽度（px，可空：URL 建档时未知） */
  width?: number;
  /** 原图高度（px，可空） */
  height?: number;
  /** 文件大小（字节，可空） */
  fileSize?: number;
  /** MIME 类型（可空） */
  mimeType?: string;
  /** 允许公开的 EXIF 元数据（API 已按公开配置过滤，敏感字段不会下发） */
  metadata?: PhotoMetadata;
  /** EXIF 拍摄时间（无时区语义，原样展示） */
  takenAt?: string;
  /** 是否添加水印（true 时前台 image 已被服务层替换为水印版本路由） */
  watermarked?: boolean;
  /** 排序值（越小越靠前） */
  sortOrder?: number;
  /** 是否公开展示 */
  published: boolean;
  /** 创建时间（数据库 UTC 字符串） */
  createdAt?: string;
  /** 更新时间（数据库 UTC 字符串） */
  updatedAt?: string;
}

/** 公开 API 响应格式：GET /api/gallery */
export interface GalleryResponse {
  data: GalleryItem[];
}

/** 公开 API 响应格式：GET /api/gallery/albums */
export interface GalleryAlbumsResponse {
  data: GalleryAlbum[];
}
