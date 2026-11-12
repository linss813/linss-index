/**
 * Gallery 元数据处理单元测试
 * 覆盖：图片尺寸探测（二进制头解析）、metadata 公开过滤（GPS 隐私）、公开配置解析
 */
import { describe, it, expect } from 'vitest';
import {
  probeImageDimensions,
  filterPublicMetadata,
  parseMetadataPublicConfig,
  extractExifMetadata,
} from '../src/lib/gallery-meta';
import { DEFAULT_METADATA_PUBLIC } from '../src/types/gallery';

/** 构造最小合法 PNG buffer：签名 + IHDR（宽高位于固定偏移） */
function makePng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  // 8 字节 PNG 签名
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR 数据长度
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** 构造最小合法 GIF buffer：头 6 字节 + 小端宽高 */
function makeGif(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

/** 构造最小合法 JPEG buffer：SOI + SOF0 段（高度在偏移 +5，宽度在 +7） */
function makeJpeg(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  buf[0] = 0xff; buf[1] = 0xd8; // SOI
  buf[2] = 0xff; buf[3] = 0xc0; // SOF0
  buf.writeUInt16BE(17, 4); // 段长度
  buf[6] = 8; // 精度
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

/** 构造最小 WEBP VP8X buffer：RIFF + WEBP + VP8X + 3 字节宽高（值-1） */
function makeWebp(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

describe('probeImageDimensions — 图片尺寸探测（二进制头，不依赖扩展名）', () => {
  it('PNG：正确读取 IHDR 宽高', () => {
    expect(probeImageDimensions(makePng(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('GIF：正确读取小端宽高', () => {
    expect(probeImageDimensions(makeGif(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it('JPEG：正确解析 SOF0 段宽高', () => {
    expect(probeImageDimensions(makeJpeg(4032, 3024))).toEqual({ width: 4032, height: 3024 });
  });

  it('WEBP：正确解析 VP8X 扩展格式宽高', () => {
    expect(probeImageDimensions(makeWebp(1200, 800))).toEqual({ width: 1200, height: 800 });
  });

  it('未知格式返回 null（不抛异常）', () => {
    expect(probeImageDimensions(Buffer.from('this is not an image at all'))).toBeNull();
  });

  it('过短 buffer 返回 null（不越界读取）', () => {
    expect(probeImageDimensions(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe('filterPublicMetadata — metadata 公开过滤（隐私闸门）', () => {
  const full = {
    camera: 'Sony A7C',
    lens: 'FE 35mm F1.8',
    focalLength: '35mm',
    aperture: 'f/1.8',
    shutterSpeed: '1/250',
    iso: 400,
    takenAt: '2026-08-20 10:30:00',
    location: { latitude: 31.23, longitude: 121.47 },
    orientation: 1,
  };

  it('默认配置：常规参数透出，GPS 位置绝不透出', () => {
    const out = filterPublicMetadata(full);
    expect(out.camera).toBe('Sony A7C');
    expect(out.iso).toBe(400);
    expect(out.location).toBeUndefined();
  });

  it('配置允许 location 时才透出坐标', () => {
    const out = filterPublicMetadata(full, { ...DEFAULT_METADATA_PUBLIC, location: true });
    expect(out.location).toEqual({ latitude: 31.23, longitude: 121.47 });
  });

  it('配置关闭的字段不透出（如 camera: false）', () => {
    const out = filterPublicMetadata(full, { ...DEFAULT_METADATA_PUBLIC, camera: false });
    expect(out.camera).toBeUndefined();
    expect(out.lens).toBe('FE 35mm F1.8');
  });

  it('orientation 不属于公开配置范围，始终透出（前端方向校正用）', () => {
    const out = filterPublicMetadata(full, { ...DEFAULT_METADATA_PUBLIC, camera: false });
    expect(out.orientation).toBe(1);
  });

  it('null / undefined 输入返回空对象', () => {
    expect(filterPublicMetadata(null)).toEqual({});
    expect(filterPublicMetadata(undefined)).toEqual({});
  });
});

describe('parseMetadataPublicConfig — 公开配置解析', () => {
  it('缺失时返回默认配置（GPS 不公开）', () => {
    expect(parseMetadataPublicConfig(null)).toEqual(DEFAULT_METADATA_PUBLIC);
    expect(parseMetadataPublicConfig(undefined)).toEqual(DEFAULT_METADATA_PUBLIC);
  });

  it('合法 JSON 与默认值合并（仅覆盖传入字段）', () => {
    const cfg = parseMetadataPublicConfig('{"location":true,"camera":false}');
    expect(cfg.location).toBe(true);
    expect(cfg.camera).toBe(false);
    expect(cfg.iso).toBe(true); // 默认保留
  });

  it('非法 JSON 回退默认（不抛异常）', () => {
    expect(parseMetadataPublicConfig('{broken')).toEqual(DEFAULT_METADATA_PUBLIC);
  });

  it('字符串布尔值不会绕过隐私默认值', () => {
    const cfg = parseMetadataPublicConfig('{"location":"false","camera":0}');
    expect(cfg.location).toBe(false);
    expect(cfg.camera).toBe(true);
  });
});

describe('extractExifMetadata — EXIF 解析健壮性', () => {
  it('无 EXIF 的图片（PNG）返回空对象，不抛异常', async () => {
    const meta = await extractExifMetadata(makePng(10, 10));
    expect(meta).toEqual({});
  });
});

/* ---------- EXIF 真实二进制解析（手工构造含 EXIF 段的 JPEG） ---------- */

/** EXIF 标签值类型（仅覆盖测试所需的三种 TIFF 类型） */
type ExifValue =
  | { type: 'ascii'; value: string }
  | { type: 'short'; value: number }
  | { type: 'rational'; num: number; den: number };

/** 测试用 EXIF 标签号 */
const TAG = {
  make: 0x010f,
  model: 0x0110,
  exposureTime: 0x829a,
  fNumber: 0x829d,
  iso: 0x8827,
  dateTimeOriginal: 0x9003,
  focalLength: 0x920a,
} as const;

/**
 * 构造含 EXIF 的最小 JPEG buffer（SOI + APP1 Exif 段 + EOI，小端 TIFF）
 * @param ifd0Tags IFD0 标签（Make/Model 等基础信息）
 * @param exifIfdTags Exif 子 IFD 标签（拍摄参数/时间等）
 * @returns 可被 exifr 解析的 JPEG 二进制
 */
function makeExifJpeg(
  ifd0Tags: Record<number, ExifValue>,
  exifIfdTags: Record<number, ExifValue> = {}
): Buffer {
  const ASCII = 2, SHORT = 3, LONG = 4, RATIONAL = 5;
  const hasExifIfd = Object.keys(exifIfdTags).length > 0;

  // 布局：TIFF 头(8B) + IFD0 + ExifIFD + 数据池；先按条目数算好各段偏移再填值
  const ifd0Count = Object.keys(ifd0Tags).length + (hasExifIfd ? 1 : 0);
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifIfdCount = Object.keys(exifIfdTags).length;
  const exifIfdSize = hasExifIfd ? 2 + exifIfdCount * 12 + 4 : 0;
  const poolOffset = 8 + ifd0Size + exifIfdSize;

  let poolSize = 0;
  const poolChunks: Buffer[] = [];

  /** 生成单个 IFD 条目（12 字节）；超过 4 字节的值写入数据池并记录偏移 */
  const makeEntry = (tag: number, v: ExifValue): Buffer => {
    const e = Buffer.alloc(12);
    e.writeUInt16LE(tag, 0);
    if (v.type === 'ascii') {
      const bytes = Buffer.from(v.value + '\0', 'ascii');
      e.writeUInt16LE(ASCII, 2);
      e.writeUInt32LE(bytes.length, 4);
      if (bytes.length <= 4) bytes.copy(e, 8);
      else {
        e.writeUInt32LE(poolOffset + poolSize, 8);
        poolChunks.push(bytes);
        poolSize += bytes.length;
      }
    } else if (v.type === 'short') {
      e.writeUInt16LE(SHORT, 2);
      e.writeUInt32LE(1, 4);
      e.writeUInt16LE(v.value, 8);
    } else {
      const r = Buffer.alloc(8);
      r.writeUInt32LE(v.num, 0);
      r.writeUInt32LE(v.den, 4);
      e.writeUInt16LE(RATIONAL, 2);
      e.writeUInt32LE(1, 4);
      e.writeUInt32LE(poolOffset + poolSize, 8);
      poolChunks.push(r);
      poolSize += 8;
    }
    return e;
  };

  // IFD0 条目 + 可选 ExifIFD 指针（LONG 型，指向紧跟 IFD0 的子 IFD），按 tag 升序
  const ifd0Entries: Buffer[] = Object.entries(ifd0Tags).map(([t, v]) => makeEntry(Number(t), v));
  if (hasExifIfd) {
    const pointer = Buffer.alloc(12);
    pointer.writeUInt16LE(0x8769, 0);
    pointer.writeUInt16LE(LONG, 2);
    pointer.writeUInt32LE(1, 4);
    pointer.writeUInt32LE(8 + ifd0Size, 8);
    ifd0Entries.push(pointer);
  }
  ifd0Entries.sort((a, b) => a.readUInt16LE(0) - b.readUInt16LE(0));

  const exifEntries: Buffer[] = Object.entries(exifIfdTags).map(([t, v]) => makeEntry(Number(t), v));
  exifEntries.sort((a, b) => a.readUInt16LE(0) - b.readUInt16LE(0));

  // TIFF 头：小端字节序 + 魔数 42 + IFD0 偏移 8
  const header = Buffer.alloc(8);
  header.write('II', 0, 'ascii');
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(8, 4);

  const tiff = Buffer.concat([
    header,
    Buffer.from([ifd0Count, 0]), ...ifd0Entries, Buffer.alloc(4),
    ...(hasExifIfd ? [Buffer.from([exifIfdCount, 0]), ...exifEntries, Buffer.alloc(4)] : []),
    ...poolChunks,
  ]);

  // 包装 JPEG：SOI + APP1（段长度含自身 2 字节） + EOI
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2, 0);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, payload, Buffer.from([0xff, 0xd9])]);
}

describe('extractExifMetadata — EXIF 映射与时间格式化（真实二进制）', () => {
  it('相机厂商别名 + 型号拼接（NIKON CORPORATION → Nikon）', async () => {
    const jpeg = makeExifJpeg(
      {
        [TAG.make]: { type: 'ascii', value: 'NIKON CORPORATION' },
        [TAG.model]: { type: 'ascii', value: 'Z 6_2' },
      },
      { [TAG.dateTimeOriginal]: { type: 'ascii', value: '2026:08:20 10:30:00' } },
    );
    const meta = await extractExifMetadata(jpeg);
    expect(meta.camera).toBe('Nikon Z 6_2');
  });

  it('拍摄时间格式化：EXIF 冒号格式 → 连字符格式（不做时区转换）', async () => {
    const jpeg = makeExifJpeg(
      {},
      { [TAG.dateTimeOriginal]: { type: 'ascii', value: '2026:08:20 10:30:00' } },
    );
    const meta = await extractExifMetadata(jpeg);
    expect(meta.takenAt).toBe('2026-08-20 10:30:00');
  });

  it('拍摄参数映射：焦距/光圈/快门/ISO（RATIONAL 与 SHORT 类型）', async () => {
    const jpeg = makeExifJpeg(
      {},
      {
        [TAG.focalLength]: { type: 'rational', num: 350, den: 10 },
        [TAG.fNumber]: { type: 'rational', num: 18, den: 10 },
        [TAG.exposureTime]: { type: 'rational', num: 1, den: 250 },
        [TAG.iso]: { type: 'short', value: 400 },
      },
    );
    const meta = await extractExifMetadata(jpeg);
    expect(meta.focalLength).toBe('35mm');
    expect(meta.aperture).toBe('f/1.8');
    expect(meta.shutterSpeed).toBe('1/250');
    expect(meta.iso).toBe(400);
  });

  it('快门 ≥0.3s 时以秒为单位显示', async () => {
    const jpeg = makeExifJpeg({}, { [TAG.exposureTime]: { type: 'rational', num: 1, den: 1 } });
    const meta = await extractExifMetadata(jpeg);
    expect(meta.shutterSpeed).toBe('1s');
  });

  it('损坏的 EXIF 段返回空对象，不抛异常', async () => {
    // APP1 声明为 Exif 但 TIFF 数据为垃圾字节
    const len = Buffer.alloc(2);
    len.writeUInt16BE(16, 0);
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
      len,
      Buffer.from('Exif\0\0garbage!!'),
      Buffer.from([0xff, 0xd9]),
    ]);
    const meta = await extractExifMetadata(buf);
    expect(meta).toEqual({});
  });
});
