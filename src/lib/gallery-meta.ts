/**
 * Gallery 图片元数据处理
 * 职责：
 *  1. 图片尺寸探测（JPEG/PNG/GIF/WEBP，二进制头解析，不依赖扩展名）
 *  2. EXIF 解析并映射为标准 metadata 结构（拍摄时间/相机/镜头/参数/GPS 等）
 *  3. Metadata 公开过滤（GPS 等敏感字段仅在公开配置允许时下发前端）
 */

import exifr from 'exifr';
import type { PhotoMetadata, MetadataPublicConfig } from '../types/gallery';
import { DEFAULT_METADATA_PUBLIC } from '../types/gallery';

/** 常见 EXIF 厂商名标准化映射（省略 " Corporation" 等后缀） */
const VENDOR_ALIASES: Record<string, string> = {
  SONY: 'Sony',
  Canon: 'Canon',
  NIKON: 'Nikon',
  'NIKON CORPORATION': 'Nikon',
  FUJIFILM: 'Fujifilm',
  Panasonic: 'Panasonic',
  OLYMPUS: 'Olympus',
  'OM Digital Solutions': 'OM System',
  Apple: 'Apple',
  samsung: 'Samsung',
  SAMSUNG: 'Samsung',
  DJI: 'DJI',
  Xiaomi: 'Xiaomi',
  HUAWEI: 'Huawei',
};

/**
 * 从图片二进制探测像素尺寸（JPEG/PNG/GIF/WEBP）
 * 通过二进制头解析，禁止仅凭扩展名判断类型（§7）
 * @param buffer 图片文件二进制
 * @returns 宽高（px）；无法识别的格式返回 null
 */
export function probeImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;

  // PNG：8 字节签名 + IHDR（宽高在固定偏移 16/20）
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // GIF：头 6 字节 "GIF8xa" + 小端宽高（偏移 6/8）
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  // JPEG：扫描 SOF0-SOF15 段（SOF8/JOSEF 除外）取小端… 实为大端宽高
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      // SOF0/1/2/3/5/6/7/9/10/11/13/14/15 均含尺寸
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      // 跳过其他段：长度字段为大端（含自身的 2 字节）
      const segLen = buffer.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
    return null;
  }

  // WEBP：RIFF 容器，按 chunk 类型解析（VP8 / VP8L / VP8X）
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    const fourcc = buffer.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ') {
      // 有损：帧头位于偏移 20，宽高在 26/28（14 位有效）
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      // 无损：偏移 21 起 4 字节压缩位流：14 位宽-1 / 14 位高-1
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
      // 扩展：偏移 24 起 3 字节小端宽-1、3 字节高-1
      const w = buffer.readUIntLE(24, 3) + 1;
      const h = buffer.readUIntLE(27, 3) + 1;
      return { width: w, height: h };
    }
  }

  return null;
}

/**
 * 解析图片 EXIF 并映射为标准 PhotoMetadata 结构
 * @param buffer 图片文件二进制（仅 JPEG/WEBP/TIFF 等含 EXIF 的格式有数据）
 * @returns 标准 metadata；无 EXIF 时返回空对象（不视为错误）
 */
export async function extractExifMetadata(buffer: Buffer): Promise<PhotoMetadata> {
  const meta: PhotoMetadata = {};
  try {
    const exif = await exifr.parse(buffer, {
      // 保持原始字符串值，避免库按服务器时区猜测拍摄时间（§18）
      reviveValues: false,
      pick: ['Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'DateTimeOriginal', 'GPSLatitude', 'GPSLongitude', 'Orientation'],
    });
    if (!exif) return meta;

    // 相机：厂商标准化 + 型号拼接
    if (exif.Make || exif.Model) {
      const vendor = VENDOR_ALIASES[exif.Make] ?? exif.Make ?? '';
      meta.camera = [vendor, exif.Model].filter(Boolean).join(' ').trim() || undefined;
    }
    if (exif.LensModel) meta.lens = String(exif.LensModel);
    if (typeof exif.FocalLength === 'number') meta.focalLength = `${Math.round(exif.FocalLength)}mm`;
    if (typeof exif.FNumber === 'number') meta.aperture = `f/${exif.FNumber}`;
    if (typeof exif.ExposureTime === 'number') {
      // 快门速度：≥0.3s 直接显示秒，否则显示 1/x 分数
      meta.shutterSpeed = exif.ExposureTime >= 0.3 ? `${Math.round(exif.ExposureTime)}s` : `1/${Math.round(1 / exif.ExposureTime)}`;
    }
    if (typeof exif.ISO === 'number') meta.iso = exif.ISO;
    if (typeof exif.Orientation === 'number') meta.orientation = exif.Orientation;

    // 拍摄时间：EXIF 原始格式 "YYYY:MM:DD HH:mm:ss" → 规范化 "YYYY-MM-DD HH:mm:ss"（不做时区转换）
    if (typeof exif.DateTimeOriginal === 'string') {
      meta.takenAt = exif.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').slice(0, 19);
    }

    // GPS：解析为坐标对象（是否公开由 filterPublicMetadata 决定）
    if (typeof exif.GPSLatitude === 'number' && typeof exif.GPSLongitude === 'number') {
      meta.location = { latitude: exif.GPSLatitude, longitude: exif.GPSLongitude };
    }
  } catch {
    // 无 EXIF 或解析失败：返回空 metadata，不影响上传流程
  }
  return meta;
}

/**
 * 按公开配置过滤 metadata（API 下发前的最后一道闸，§35 隐私原则）
 * @param meta 完整 metadata
 * @param config 公开配置
 * @returns 仅包含允许公开字段的 metadata（location 未允许时绝不出现）
 */
export function filterPublicMetadata(
  meta: PhotoMetadata | null | undefined,
  config: MetadataPublicConfig = DEFAULT_METADATA_PUBLIC
): PhotoMetadata {
  if (!meta) return {};
  const out: PhotoMetadata = {};
  if (config.camera && meta.camera) out.camera = meta.camera;
  if (config.lens && meta.lens) out.lens = meta.lens;
  if (config.focalLength && meta.focalLength) out.focalLength = meta.focalLength;
  if (config.aperture && meta.aperture) out.aperture = meta.aperture;
  if (config.shutterSpeed && meta.shutterSpeed) out.shutterSpeed = meta.shutterSpeed;
  if (config.iso && typeof meta.iso === 'number') out.iso = meta.iso;
  if (config.takenAt && meta.takenAt) out.takenAt = meta.takenAt;
  // GPS 白名单外绝不透出：即使配置允许，也仅返回坐标对象本身
  if (config.location && meta.location) out.location = meta.location;
  if (meta.orientation) out.orientation = meta.orientation;
  return out;
}

/**
 * 解析公开配置 JSON（settings 表存储值）
 * @param raw settings 中存储的 JSON 字符串
 * @returns 合法配置；缺失或格式错误时回退默认值（未知字段忽略，保证向后兼容）
 */
export function parseMetadataPublicConfig(raw: string | null | undefined): MetadataPublicConfig {
  if (!raw) return { ...DEFAULT_METADATA_PUBLIC };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = { ...DEFAULT_METADATA_PUBLIC };
    for (const key of Object.keys(result) as (keyof MetadataPublicConfig)[]) {
      // Only real booleans may override privacy defaults. Values such as the
      // string "false" must not become truthy and accidentally expose GPS.
      if (typeof parsed?.[key] === 'boolean') result[key] = parsed[key];
    }
    return result;
  } catch {
    return { ...DEFAULT_METADATA_PUBLIC };
  }
}
