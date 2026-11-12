/**
 * 水印合成核心库（v2.8.0：native sharp + WASM 双运行时）
 * 职责：读取水印配置 / 用 sharp 将水印图烘焙进原图 / 磁盘缓存
 *
 * 设计要点：
 * - 服务端烘焙：水印合成进图片字节，右键保存 / 下载拿到的就是带水印图（真正防盗图）
 * - 磁盘缓存：合成结果按「照片 ID + 配置指纹」落盘，配置变更后指纹变化自动失效旧缓存
 * - 输出格式跟随原图（jpeg / png / webp）；GIF 不支持（sharp 仅读首帧），调用方需回退原图
 * - 水印图为空 / 读取失败时返回 null，调用方回退原图直出，保证前台永不白屏
 * - 图片处理器懒加载（见 loadImageProcessor）：模块顶层不 import sharp，
 *   仅 import 本模块（如 /gallery 链路）不会触发任何原生模块初始化；
 *   运行时优先原生 sharp，老 CPU（不支持 x86-64-v2/SSE4.2）自动兜底 WASM（@img/sharp-wasm32），
 *   两者皆不可用时返回 null 走原图回退，站点其他功能不受影响
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, schema } from './db';
import { eq } from 'drizzle-orm';
import { envConfig } from './env';
import { parseWatermarkConfig, type WatermarkConfig } from '../types/gallery';

/** settings 表中水印配置的键名 */
export const WATERMARK_SETTING_KEY = 'gallery_watermark';

/**
 * 水印渲染算法版本。编码参数变化时必须递增，使磁盘缓存与公开 immutable URL
 * 同时失效，避免继续返回旧的低质量合成图。
 */
export const WATERMARK_RENDER_VERSION = 'v3-original-quality';

/** 水印缓存目录（位于上传目录下，随数据一起备份） */
export const WATERMARK_CACHE_DIR = join(envConfig.uploadDir, 'watermarks');

/** 支持烘焙水印的输出格式（sharp 可编码且保留透明度的格式） */
const SUPPORTED_OUTPUT: Record<string, 'jpeg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** 图片处理器运行时类型：native = 系统原生二进制；wasm = WebAssembly 兜底（老 CPU） */
export type ImageProcessorRuntime = 'native' | 'wasm';

/** sharp 工厂函数类型（native 与 WASM 运行时 API 完全一致，业务代码不感知底层差异） */
type SharpFactory = typeof import('sharp')['default'];

/** 已加载的图片处理器描述 */
interface ImageProcessor {
  runtime: ImageProcessorRuntime;
  sharp: SharpFactory;
}

/** 处理器加载结果记忆（Promise 缓存，保证全进程只探测一次，并发请求共用） */
let processorPromise: Promise<ImageProcessor | null> | null = null;

/**
 * 懒加载图片处理器（不在模块加载阶段执行，首次合成水印时才触发）
 *
 * 选择策略：
 * 1. 动态 import('sharp') —— sharp 官方运行时选择器优先加载平台原生二进制，
 *    并通过 _isUsingX64V2() 检测 CPU；原生不可用（老 CPU / 缺二进制）时
 *    选择器自动兜底到 @img/sharp-wasm32（WASM），两者业务 API 完全一致；
 * 2. native 与 WASM 均不可用（如 WASM 包未安装）时返回 null，
 *    调用方按既有安全设计回退原图直出，/gallery 等页面永不因此 500。
 *
 * @returns 处理器描述对象；图片处理能力完全不可用时为 null
 */
export function loadImageProcessor(): Promise<ImageProcessor | null> {
  if (!processorPromise) {
    processorPromise = (async (): Promise<ImageProcessor | null> => {
      try {
        const { default: sharp } = await import('sharp');
        // sharp.versions 内容来自 @img/sharp-<runtime>/versions.json，
        // 仅 WASM 版的版本清单包含 emscripten 字段（官方公开 API，可作运行时判据）
        const runtime: ImageProcessorRuntime =
          sharp.versions && 'emscripten' in sharp.versions ? 'wasm' : 'native';
        if (runtime === 'wasm') {
          console.info('[watermark] 原生 sharp 不可用，已切换 WASM 运行时（合成较慢，结果会磁盘缓存）');
        }
        return { runtime, sharp };
      } catch (err) {
        console.warn(
          '[watermark] 图片处理器加载失败（native 与 WASM 均不可用），水印功能本次停用:',
          err instanceof Error ? err.message : err
        );
        return null;
      }
    })();
  }
  return processorPromise;
}

/**
 * 读取水印配置（缺失 / 格式错误回退默认值）
 * @returns 合法的水印配置对象
 */
export function getWatermarkConfig(): WatermarkConfig {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, WATERMARK_SETTING_KEY)).get();
  return parseWatermarkConfig(row?.value);
}

/**
 * 计算配置指纹（配置变更时缓存自动失效）
 * @param config 水印配置
 * @returns 16 位 hex 指纹
 */
export function configFingerprint(config: WatermarkConfig): string {
  return createHash('md5')
    .update(`${WATERMARK_RENDER_VERSION}:${JSON.stringify(config)}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * 计算水印缓存文件路径
 * @param photoId 照片 ID
 * @param config 水印配置（用于指纹）
 * @returns 缓存文件绝对路径（.jpg 后缀仅为占位，实际格式由内容决定）
 */
export function cachePath(photoId: number, config: WatermarkConfig): string {
  return join(WATERMARK_CACHE_DIR, `${photoId}_${configFingerprint(config)}.bin`);
}

/**
 * 根据位置枚举计算水印合成坐标
 * @param baseW 原图宽度
 * @param baseH 原图高度
 * @param wmW 水印缩放后宽度
 * @param wmH 水印缩放后高度
 * @param marginPx 边距（px）
 * @param position 位置枚举（预设位或 custom）
 * @param customX custom 模式横坐标（0-100，占可用宽度百分比）
 * @param customY custom 模式纵坐标（0-100，占可用高度百分比）
 * @returns { left, top } 合成坐标
 */
export function calcWatermarkPosition(
  baseW: number,
  baseH: number,
  wmW: number,
  wmH: number,
  marginPx: number,
  position: WatermarkConfig['position'],
  customX = 100,
  customY = 100
): { left: number; top: number } {
  switch (position) {
    case 'custom': {
      // 自定义坐标：posX/posY 为「可用区域」（去掉两侧边距后）内的百分比位置
      // 与后台拖动预览的映射公式完全一致：left = margin + posX% × (宽 - 水印宽 - 2×margin)
      const maxLeft = Math.max(0, baseW - wmW - marginPx * 2);
      const maxTop = Math.max(0, baseH - wmH - marginPx * 2);
      const cx = Math.min(100, Math.max(0, customX));
      const cy = Math.min(100, Math.max(0, customY));
      return {
        left: marginPx + Math.round(maxLeft * (cx / 100)),
        top: marginPx + Math.round(maxTop * (cy / 100)),
      };
    }
    case 'top-left':
      return { left: marginPx, top: marginPx };
    case 'top-right':
      return { left: Math.max(0, baseW - wmW - marginPx), top: marginPx };
    case 'center':
      return { left: Math.max(0, Math.round((baseW - wmW) / 2)), top: Math.max(0, Math.round((baseH - wmH) / 2)) };
    case 'bottom-left':
      return { left: marginPx, top: Math.max(0, baseH - wmH - marginPx) };
    case 'bottom-right':
    default:
      return { left: Math.max(0, baseW - wmW - marginPx), top: Math.max(0, baseH - wmH - marginPx) };
  }
}

/**
 * 将水印烘焙进原图
 * @param inputBuffer 原图二进制
 * @param mimeType 原图 MIME 类型（决定输出格式）
 * @param config 水印配置
 * @returns 合成后的 { buffer, mime }；无法合成（无水印图 / GIF / 失败）时返回 null
 */
export async function applyWatermark(
  inputBuffer: Buffer,
  mimeType: string | null,
  config: WatermarkConfig
): Promise<{ buffer: Buffer; mime: string } | null> {
  // 未配置水印图：功能失效，回退原图
  if (!config.image || !config.image.startsWith('/uploads/')) return null;
  // 输出格式跟随原图；GIF 等不支持格式回退原图
  const outFormat = SUPPORTED_OUTPUT[mimeType ?? 'image/jpeg'];
  if (!outFormat) return null;

  // 读取水印图文件（站内 /uploads/ 路径）
  let wmBuffer: Buffer;
  try {
    wmBuffer = readFileSync(join(envConfig.uploadDir, config.image.slice('/uploads/'.length)));
  } catch {
    return null;
  }

  // 懒加载图片处理器：native 优先，老 CPU 自动 WASM 兜底；均不可用时回退原图
  const processor = await loadImageProcessor();
  if (!processor) return null;
  const sharp = processor.sharp;

  try {
    const base = sharp(inputBuffer);
    const meta = await base.metadata();
    if (!meta.width || !meta.height) return null;

    // 水印宽度 = 原图宽度 × scale%，保持宽高比
    const wmW = Math.max(1, Math.round(meta.width * (config.scale / 100)));
    let wm = sharp(wmBuffer).resize({ width: wmW });
    const wmMeta = await sharp(wmBuffer).metadata();
    const wmAspect = wmMeta.width && wmMeta.height ? wmMeta.width / wmMeta.height : 1;
    const wmH = Math.max(1, Math.round(wmW / wmAspect));

    // 不透明度：通过 1×1 白色像素 dest-in 混合缩放 alpha 通道
    if (config.opacity < 100) {
      const alpha = Math.round((config.opacity / 100) * 255);
      wm = wm.ensureAlpha().composite([
        {
          input: Buffer.from([255, 255, 255, alpha]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in',
        },
      ]);
    }
    const wmFinal = await wm.png().toBuffer();

    // 边距 = 图片短边 × margin%
    const marginPx = Math.round(Math.min(meta.width, meta.height) * (config.margin / 100));
    const { left, top } = calcWatermarkPosition(meta.width, meta.height, wmW, wmH, marginPx, config.position, config.posX, config.posY);

    // 只保留色彩配置文件，不复制 EXIF/GPS 等元数据，兼顾颜色准确性与隐私。
    const composed = base
      .composite([{ input: wmFinal, left, top }])
      .keepIccProfile();
    // 完整分辨率水印图承担“查看原图 / 下载原图”职责，优先保留细节；
    // 快速浏览另有 1920px WebP preview，不需要在这里用低质量换取体积。
    const buffer = outFormat === 'jpeg'
      ? await composed.jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
      : outFormat === 'webp'
        ? await composed.webp({ quality: 94, smartSubsample: true, effort: 5 }).toBuffer()
        : await composed.png({ compressionLevel: 7 }).toBuffer();

    // WASM 运行时 toBuffer() 返回 SharedArrayBuffer 支撑的零拷贝视图，
    // 直接交给 Response/写盘存在兼容隐患（undici 会误按字符串编码），
    // 统一拷贝为独立 ArrayBuffer 支撑的 Buffer（native 下同样安全，代价可忽略）
    return { buffer: Buffer.from(buffer), mime: outFormat === 'jpeg' ? 'image/jpeg' : `image/${outFormat}` };
  } catch {
    // 合成失败（图片损坏等）：回退原图，不阻断前台展示
    return null;
  }
}

/**
 * 获取照片的水印版本（优先磁盘缓存，未命中则合成并写缓存）
 * @param photoId 照片 ID
 * @returns { buffer, mime } 或 null（照片不存在 / 未开水印 / 无法合成）
 */
export async function getWatermarkedImage(photoId: number): Promise<{ buffer: Buffer; mime: string } | null> {
  const row = db.select().from(schema.galleryPhotos).where(eq(schema.galleryPhotos.id, photoId)).get();
  // 记录不存在 / 未发布 / 未启用水印 / 非本地文件一律拒绝。
  // 此函数只服务公开输出路由，隐藏照片不能通过猜测 ID 绕过发布状态。
  if (!row || row.published !== 1 || row.watermarked !== 1) return null;
  if (!row.image.startsWith('/uploads/')) return null;

  const config = getWatermarkConfig();
  if (!config.image) return null;

  // 缓存命中直接返回
  const cached = cachePath(photoId, config);
  if (existsSync(cached)) {
    try {
      const buffer = readFileSync(cached);
      // 缓存文件首字节记录 MIME（格式：`mime\n` + 二进制），解析头部
      const nl = buffer.indexOf(0x0a);
      if (nl > 0) {
        const mime = buffer.subarray(0, nl).toString('utf8');
        return { buffer: buffer.subarray(nl + 1), mime };
      }
    } catch {
      /* 缓存读取失败：重新合成 */
    }
  }

  // 读取原图并合成
  let inputBuffer: Buffer;
  try {
    inputBuffer = readFileSync(join(envConfig.uploadDir, row.image.slice('/uploads/'.length)));
  } catch {
    return null;
  }
  const result = await applyWatermark(inputBuffer, row.mimeType, config);
  if (!result) return null;

  // 写缓存（头部记录 MIME；失败不影响本次响应）
  try {
    mkdirSync(WATERMARK_CACHE_DIR, { recursive: true });
    const header = Buffer.from(`${result.mime}\n`, 'utf8');
    writeFileSync(cached, Buffer.concat([header, result.buffer]));
  } catch {
    /* 缓存写入失败：静默跳过 */
  }
  return result;
}

/**
 * 清理照片的全部水印缓存（配置变更 / 照片删除时调用）
 * @param photoId 照片 ID；省略时清空整个缓存目录
 */
export function invalidateWatermarkCache(photoId?: number): void {
  try {
    if (!existsSync(WATERMARK_CACHE_DIR)) return;
    const prefix = photoId != null ? `${photoId}_` : '';
    for (const name of readdirSync(WATERMARK_CACHE_DIR)) {
      if (!prefix || name.startsWith(prefix)) {
        try {
          unlinkSync(join(WATERMARK_CACHE_DIR, name));
        } catch {
          /* 单个文件删除失败忽略 */
        }
      }
    }
  } catch {
    /* 目录不存在等：静默 */
  }
}
