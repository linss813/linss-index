/**
 * 水印功能单元测试（v2.6.0）
 * 覆盖：
 *  1. 配置解析（parseWatermarkConfig 默认值 / 钳制 / 容错）
 *  2. 位置计算（calcWatermarkPosition 五个位置）
 *  3. sharp 合成（applyWatermark 正常合成 / GIF 回退 / 无水印图回退）
 *  4. 缓存链路（getWatermarkedImage 合成 → 落盘缓存 → 失效清理）
 *  5. 水印管理 API（GET / PUT / POST 鉴权与校验）
 *  6. 水印图输出路由（/watermarked/:id 200 / 404 分支）
 *  7. 服务层水印路由替换（前台 image → /watermarked/:id，后台保留原图）
 *
 * 注意：测试会真实读写 UPLOAD_DIR（vitest.config.ts 注入为 ./data/test-uploads）
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import sharp from 'sharp';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { db, schema } from '../src/lib/db';
import { eq } from 'drizzle-orm';
import { setSession, type SessionAdmin } from '../src/lib/auth';
import { envConfig } from '../src/lib/env';
import {
  WATERMARK_SETTING_KEY,
  WATERMARK_CACHE_DIR,
  applyWatermark,
  cachePath,
  calcWatermarkPosition,
  configFingerprint,
  getWatermarkConfig,
  getWatermarkedImage,
  invalidateWatermarkCache,
  loadImageProcessor,
} from '../src/lib/watermark';
import { parseWatermarkConfig, DEFAULT_WATERMARK_CONFIG } from '../src/types/gallery';
import { GET as GET_WM, PUT as PUT_WM, POST as POST_WM } from '../src/pages/api/admin/watermark';
import { GET as GET_WATERMARKED } from '../src/pages/watermarked/[id]';
import { POST as batchUpdate } from '../src/pages/api/admin/gallery/batch-update';
import { getGallery, getAllGallery } from '../src/services/gallery';
import type { APIRoute } from 'astro';

/* ========== 测试素材 ========== */
/** 测试用水印图文件名（写入 UPLOAD_DIR） */
const WM_FILE = 'wm-test.png';
/** 测试用底图文件名 */
const BASE_FILE = 'base-test.png';

/** 生成纯色测试图片 buffer */
async function makeImage(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { ...color, alpha: 1 } },
  }).png().toBuffer();
}

/** 初始化测试素材（底图 + 水印图写入上传目录） */
async function ensureFixtures(): Promise<void> {
  mkdirSync(envConfig.uploadDir, { recursive: true });
  const base = await makeImage(200, 150, { r: 200, g: 50, b: 50 });
  const wm = await makeImage(40, 40, { r: 255, g: 255, b: 255 });
  if (!existsSync(join(envConfig.uploadDir, BASE_FILE))) writeFileSync(join(envConfig.uploadDir, BASE_FILE), base);
  if (!existsSync(join(envConfig.uploadDir, WM_FILE))) writeFileSync(join(envConfig.uploadDir, WM_FILE), wm);
}

/** 写入水印配置到 settings 表 */
function setWmSetting(config: Record<string, unknown>): void {
  const value = JSON.stringify(config);
  const existing = db.select().from(schema.settings).where(eq(schema.settings.key, WATERMARK_SETTING_KEY)).get();
  if (existing) {
    db.update(schema.settings).set({ value }).where(eq(schema.settings.key, WATERMARK_SETTING_KEY)).run();
  } else {
    db.insert(schema.settings).values({ key: WATERMARK_SETTING_KEY, value }).run();
  }
}

/** 有效测试配置（水印图已就位） */
function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    image: `/uploads/${WM_FILE}`,
    position: 'bottom-right',
    opacity: 100,
    scale: 20,
    margin: 5,
    posX: 100,
    posY: 100,
    ...overrides,
  };
}

/** 构造模拟会话（内存 Map） */
function mockSession() {
  const store = new Map<string, unknown>();
  return {
    set: async (k: string, v: unknown) => { store.set(k, v); },
    get: async (k: string) => store.get(k) ?? null,
    destroy: async () => { store.clear(); },
  };
}

/** 已登录会话 */
async function authedSession() {
  const session = mockSession();
  await setSession({ session } as never, { id: 1, username: 'admin' } as SessionAdmin);
  return session;
}

/** 插入一条照片记录，返回数字 id */
function seedPhoto(overrides: Partial<Record<string, unknown>> = {}): number {
  const row = db.insert(schema.galleryPhotos).values({
    image: `/uploads/${BASE_FILE}`,
    mimeType: 'image/png',
    published: 1,
    watermarked: 1,
    sortOrder: 0,
    ...overrides,
  }).returning().get();
  return row.id;
}

beforeEach(async () => {
  db.delete(schema.galleryPhotos).run();
  db.delete(schema.settings).where(eq(schema.settings.key, WATERMARK_SETTING_KEY)).run();
  invalidateWatermarkCache();
  await ensureFixtures();
});

afterAll(() => {
  // 测试文件并行共享 UPLOAD_DIR，只清理本文件拥有的素材，避免删除其他用例正在读取的图片。
  invalidateWatermarkCache();
  for (const name of [BASE_FILE, WM_FILE]) {
    try {
      unlinkSync(join(envConfig.uploadDir, name));
    } catch {
      /* 文件可能已不存在。 */
    }
  }
});

/* ========== 1. 配置解析 ========== */
describe('parseWatermarkConfig — 配置解析', () => {
  it('空值回退默认配置', () => {
    expect(parseWatermarkConfig(undefined)).toEqual(DEFAULT_WATERMARK_CONFIG);
    expect(parseWatermarkConfig(null)).toEqual(DEFAULT_WATERMARK_CONFIG);
    expect(parseWatermarkConfig('')).toEqual(DEFAULT_WATERMARK_CONFIG);
  });

  it('非法 JSON 回退默认配置', () => {
    expect(parseWatermarkConfig('{broken')).toEqual(DEFAULT_WATERMARK_CONFIG);
  });

  it('合法字段被采纳，非法 position 回退默认', () => {
    const cfg = parseWatermarkConfig(JSON.stringify({
      image: '/uploads/a.png', position: 'middle-center', opacity: 55, scale: 30, margin: 10,
    }));
    expect(cfg.image).toBe('/uploads/a.png');
    expect(cfg.position).toBe('bottom-right'); // 非法位置回退
    expect(cfg.opacity).toBe(55);
    expect(cfg.scale).toBe(30);
    expect(cfg.margin).toBe(10);
  });

  it('数值越界被钳制到合法范围', () => {
    const cfg = parseWatermarkConfig(JSON.stringify({ opacity: 999, scale: -5, margin: 88.6 }));
    expect(cfg.opacity).toBe(100);
    expect(cfg.scale).toBe(5);
    expect(cfg.margin).toBe(20);
  });
});

/* ========== 2. 位置计算 ========== */
describe('calcWatermarkPosition — 五个位置坐标', () => {
  // 底图 200×150，水印 40×30，边距 10
  const args = [200, 150, 40, 30, 10] as const;

  it('top-left / top-right', () => {
    expect(calcWatermarkPosition(...args, 'top-left')).toEqual({ left: 10, top: 10 });
    expect(calcWatermarkPosition(...args, 'top-right')).toEqual({ left: 150, top: 10 });
  });

  it('center 居中', () => {
    expect(calcWatermarkPosition(...args, 'center')).toEqual({ left: 80, top: 60 });
  });

  it('bottom-left / bottom-right', () => {
    expect(calcWatermarkPosition(...args, 'bottom-left')).toEqual({ left: 10, top: 110 });
    expect(calcWatermarkPosition(...args, 'bottom-right')).toEqual({ left: 150, top: 110 });
  });

  it('水印大于底图时坐标不为负', () => {
    const pos = calcWatermarkPosition(50, 50, 100, 100, 10, 'bottom-right');
    expect(pos.left).toBe(0);
    expect(pos.top).toBe(0);
  });

  it('custom 模式：百分比坐标映射到可用区域', () => {
    // 可用宽度 = 200 - 40 - 20 = 140，可用高度 = 150 - 30 - 20 = 100
    expect(calcWatermarkPosition(...args, 'custom', 0, 0)).toEqual({ left: 10, top: 10 });
    expect(calcWatermarkPosition(...args, 'custom', 100, 100)).toEqual({ left: 150, top: 110 });
    expect(calcWatermarkPosition(...args, 'custom', 50, 50)).toEqual({ left: 80, top: 60 });
  });

  it('custom 模式：坐标越界被钳制到 0-100', () => {
    expect(calcWatermarkPosition(...args, 'custom', -50, 200)).toEqual({ left: 10, top: 110 });
  });
});

/* ========== 3. 指纹与缓存路径 ========== */
describe('configFingerprint / cachePath', () => {
  it('配置变更指纹变化（缓存自动失效的基础）', () => {
    const a = configFingerprint(validConfig() as never);
    const b = configFingerprint(validConfig({ opacity: 50 }) as never);
    expect(a).not.toBe(b);
    expect(a).toHaveLength(16);
  });

  it('cachePath 包含照片 ID 与指纹', () => {
    const cfg = validConfig();
    const p = cachePath(42, cfg as never);
    expect(p.startsWith(WATERMARK_CACHE_DIR)).toBe(true);
    expect(p).toContain(`42_${configFingerprint(cfg as never)}`);
  });
});

/* ========== 4. sharp 合成 ========== */
describe('applyWatermark — 水印合成', () => {
  it('正常合成：输出与输入不同且格式跟随原图', async () => {
    const base = await makeImage(200, 150, { r: 200, g: 50, b: 50 });
    const result = await applyWatermark(base, 'image/png', validConfig() as never);
    expect(result).not.toBeNull();
    expect(result!.mime).toBe('image/png');
    expect(result!.buffer.equals(base)).toBe(false);
    // 输出仍为合法 PNG 且尺寸不变
    const meta = await sharp(result!.buffer).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('JPEG 输入输出高保真 4:4:4 image/jpeg', async () => {
    const base = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).jpeg().toBuffer();
    const result = await applyWatermark(base, 'image/jpeg', validConfig() as never);
    expect(result?.mime).toBe('image/jpeg');
    const meta = await sharp(result!.buffer).metadata();
    expect(meta.chromaSubsampling).toBe('4:4:4');
  });

  it('未配置水印图返回 null（回退原图）', async () => {
    const base = await makeImage(50, 50, { r: 0, g: 0, b: 0 });
    expect(await applyWatermark(base, 'image/png', validConfig({ image: '' }) as never)).toBeNull();
  });

  it('水印图路径非站内 /uploads/ 返回 null', async () => {
    const base = await makeImage(50, 50, { r: 0, g: 0, b: 0 });
    expect(await applyWatermark(base, 'image/png', validConfig({ image: 'https://evil.com/wm.png' }) as never)).toBeNull();
  });

  it('水印图文件不存在返回 null', async () => {
    const base = await makeImage(50, 50, { r: 0, g: 0, b: 0 });
    expect(await applyWatermark(base, 'image/png', validConfig({ image: '/uploads/no-such-wm.png' }) as never)).toBeNull();
  });

  it('GIF 等不支持格式返回 null（回退原图）', async () => {
    const base = await makeImage(50, 50, { r: 0, g: 0, b: 0 });
    expect(await applyWatermark(base, 'image/gif', validConfig() as never)).toBeNull();
  });

  it('损坏图片返回 null（不抛异常）', async () => {
    expect(await applyWatermark(Buffer.from('not-an-image'), 'image/png', validConfig() as never)).toBeNull();
  });
});

/* ========== 4b. 双运行时处理器（native 优先 + WASM 兜底） ========== */
describe('loadImageProcessor — native 优先 / WASM 兜底', () => {
  it('懒加载成功：返回合法运行时标识与可调用 sharp', async () => {
    const processor = await loadImageProcessor();
    expect(processor).not.toBeNull();
    expect(['native', 'wasm']).toContain(processor!.runtime);
    expect(typeof processor!.sharp).toBe('function');
    expect(typeof processor!.sharp.versions).toBe('object');
  });

  it('WASM 兜底包 @img/sharp-wasm32 已安装且 binding 完整（老 CPU 部署就绪）', () => {
    // sharp 官方选择器在原生二进制不可用时 require('@img/sharp-wasm32/sharp.node')
    const require = createRequire(import.meta.url);
    const binding = require('@img/sharp-wasm32/sharp.node');
    for (const fn of ['pipeline', 'metadata', 'stats']) {
      expect(typeof binding[fn]).toBe('function');
    }
  });

  it('合成结果 buffer 由独立 ArrayBuffer 支撑（防 WASM SharedArrayBuffer 回归）', async () => {
    // WASM 运行时 toBuffer() 返回 SharedArrayBuffer 视图，直接交给 Response 会损坏；
    // applyWatermark 统一 Buffer.from 拷贝，输出必须脱钩
    const base = await makeImage(80, 60, { r: 10, g: 20, b: 30 });
    const result = await applyWatermark(base, 'image/png', validConfig() as never);
    expect(result).not.toBeNull();
    expect(result!.buffer.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result!.buffer.buffer).not.toBeInstanceOf(SharedArrayBuffer);
  });
});

/* ========== 5. 缓存链路 ========== */
describe('getWatermarkedImage — 合成 + 磁盘缓存', () => {
  it('开启水印的本地照片：合成成功并写入缓存', async () => {
    setWmSetting(validConfig());
    const id = seedPhoto();
    const result = await getWatermarkedImage(id);
    expect(result).not.toBeNull();
    expect(result!.mime).toBe('image/png');
    // 缓存文件已落盘
    expect(existsSync(cachePath(id, getWatermarkConfig()))).toBe(true);
    // 二次读取命中缓存，结果一致
    const cached = await getWatermarkedImage(id);
    expect(cached!.buffer.equals(result!.buffer)).toBe(true);
  });

  it('invalidateWatermarkCache(id) 仅清理指定照片缓存', async () => {
    setWmSetting(validConfig());
    const id1 = seedPhoto();
    const id2 = seedPhoto();
    await getWatermarkedImage(id1);
    await getWatermarkedImage(id2);
    invalidateWatermarkCache(id1);
    expect(existsSync(cachePath(id1, getWatermarkConfig()))).toBe(false);
    expect(existsSync(cachePath(id2, getWatermarkConfig()))).toBe(true);
  });

  it('未发布 / 未开水印 / 外部 URL / 照片不存在均返回 null', async () => {
    setWmSetting(validConfig());
    const hidden = seedPhoto({ published: 0 });
    const off = seedPhoto({ watermarked: 0 });
    const external = seedPhoto({ image: 'https://example.com/a.jpg' });
    expect(await getWatermarkedImage(hidden)).toBeNull();
    expect(await getWatermarkedImage(off)).toBeNull();
    expect(await getWatermarkedImage(external)).toBeNull();
    expect(await getWatermarkedImage(999999)).toBeNull();
  });

  it('未配置水印图时返回 null（功能自动失效）', async () => {
    const id = seedPhoto();
    expect(await getWatermarkedImage(id)).toBeNull();
  });
});

/* ========== 6. 水印管理 API ========== */
describe('水印管理 API — GET / PUT / POST', () => {
  /** 构造 JSON 请求上下文 */
  function jsonCtx(method: string, session: unknown, body?: unknown) {
    return {
      request: new Request('http://localhost/api/admin/watermark', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      session,
      clientAddress: '127.0.0.1',
    } as unknown as Parameters<APIRoute>[0];
  }

  it('未登录 GET / PUT / POST 均返回 401', async () => {
    const s = mockSession();
    expect((await GET_WM(jsonCtx('GET', s))).status).toBe(401);
    expect((await PUT_WM(jsonCtx('PUT', s, {}))).status).toBe(401);
    const fd = new FormData();
    fd.append('file', new File([Buffer.from('x')], 'a.png', { type: 'image/png' }));
    const postCtx = {
      request: new Request('http://localhost/api/admin/watermark', { method: 'POST', body: fd }),
      session: s,
      clientAddress: '127.0.0.1',
    } as unknown as Parameters<APIRoute>[0];
    expect((await POST_WM(postCtx)).status).toBe(401);
  });

  it('GET 返回当前配置（未设置时为默认值）', async () => {
    const session = await authedSession();
    const res = await GET_WM(jsonCtx('GET', session));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULT_WATERMARK_CONFIG);
  });

  it('PUT 合并更新配置并持久化', async () => {
    const session = await authedSession();
    const res = await PUT_WM(jsonCtx('PUT', session, { position: 'top-left', opacity: 45 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.position).toBe('top-left');
    expect(data.opacity).toBe(45);
    // 未传字段保持默认
    expect(data.scale).toBe(DEFAULT_WATERMARK_CONFIG.scale);
    // 数据库已持久化
    expect(getWatermarkConfig().position).toBe('top-left');
  });

  it('PUT 非法参数返回 400（位置枚举 / 数值范围 / 水印图路径）', async () => {
    const session = await authedSession();
    expect((await PUT_WM(jsonCtx('PUT', session, { position: 'everywhere' }))).status).toBe(400);
    expect((await PUT_WM(jsonCtx('PUT', session, { opacity: 101 }))).status).toBe(400);
    expect((await PUT_WM(jsonCtx('PUT', session, { scale: 4 }))).status).toBe(400);
    expect((await PUT_WM(jsonCtx('PUT', session, { image: 'https://evil.com/wm.png' }))).status).toBe(400);
    expect((await PUT_WM(jsonCtx('PUT', session, { posX: 101 }))).status).toBe(400);
    expect((await PUT_WM(jsonCtx('PUT', session, { posY: -1 }))).status).toBe(400);
  });

  it('PUT custom 位置与坐标保存成功', async () => {
    const session = await authedSession();
    const res = await PUT_WM(jsonCtx('PUT', session, { position: 'custom', posX: 30, posY: 70 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.position).toBe('custom');
    expect(data.posX).toBe(30);
    expect(data.posY).toBe(70);
    expect(getWatermarkConfig().position).toBe('custom');
  });

  it('POST 上传水印图成功（201 + 文件落盘）', async () => {
    const session = await authedSession();
    const png = await makeImage(20, 20, { r: 0, g: 0, b: 0 });
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array(png)], 'logo.png', { type: 'image/png' }));
    const ctx = {
      request: new Request('http://localhost/api/admin/watermark', { method: 'POST', body: fd }),
      session,
      clientAddress: '127.0.0.1',
    } as unknown as Parameters<APIRoute>[0];
    const res = await POST_WM(ctx);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.image).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
    expect(existsSync(join(envConfig.uploadDir, data.image.slice('/uploads/'.length)))).toBe(true);
  });

  it('POST 不支持的类型返回 400', async () => {
    const session = await authedSession();
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array(Buffer.from('GIF89a'))], 'a.gif', { type: 'image/gif' }));
    const ctx = {
      request: new Request('http://localhost/api/admin/watermark', { method: 'POST', body: fd }),
      session,
      clientAddress: '127.0.0.1',
    } as unknown as Parameters<APIRoute>[0];
    expect((await POST_WM(ctx)).status).toBe(400);
  });
});

/* ========== 7. 水印图输出路由 ========== */
describe('GET /watermarked/:id — 水印图输出', () => {
  /** 构造路由上下文 */
  function routeCtx(id: string) {
    return { params: { id } } as unknown as Parameters<APIRoute>[0];
  }

  it('非法 ID 返回 404', async () => {
    expect((await GET_WATERMARKED(routeCtx('abc'))).status).toBe(404);
    expect((await GET_WATERMARKED(routeCtx('0'))).status).toBe(404);
    expect((await GET_WATERMARKED(routeCtx('-3'))).status).toBe(404);
  });

  it('开启水印的照片返回水印版本（长缓存头）', async () => {
    setWmSetting(validConfig());
    const id = seedPhoto();
    const res = await GET_WATERMARKED(routeCtx(String(id)));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    const bytes = Buffer.from(await res.arrayBuffer());
    // 返回的是合成后的图片（与底图字节不同）
    const base = await makeImage(200, 150, { r: 200, g: 50, b: 50 });
    expect(bytes.equals(base)).toBe(false);
  });

  it('未开水印的本地照片返回 404，不能通过枚举 ID 读取原图', async () => {
    const id = seedPhoto({ watermarked: 0 });
    const res = await GET_WATERMARKED(routeCtx(String(id)));
    expect(res.status).toBe(404);
  });

  it('未发布的水印照片返回 404', async () => {
    setWmSetting(validConfig());
    const id = seedPhoto({ published: 0, watermarked: 1 });
    expect((await GET_WATERMARKED(routeCtx(String(id)))).status).toBe(404);
  });

  it('不存在的照片返回 404', async () => {
    expect((await GET_WATERMARKED(routeCtx('987654'))).status).toBe(404);
  });
});

/* ========== 8. 批量水印开关 + 服务层路由替换 ========== */
describe('批量水印开关与服务层路由替换', () => {
  /** 构造 POST 上下文 */
  function postCtx(session: unknown, body: unknown) {
    return {
      request: new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      session,
      clientAddress: '127.0.0.1',
    } as unknown as Parameters<APIRoute>[0];
  }

  it('batch-update watermark_on / watermark_off 切换水印标记', async () => {
    const session = await authedSession();
    const id1 = seedPhoto({ watermarked: 0 });
    const id2 = seedPhoto({ watermarked: 0 });
    const on = await batchUpdate(postCtx(session, { ids: [id1, id2], action: 'watermark_on' }));
    expect(on.status).toBe(200);
    expect((await on.json()).updated).toBe(2);
    const rows = db.select().from(schema.galleryPhotos).all();
    expect(rows.every((r) => r.watermarked === 1)).toBe(true);

    const off = await batchUpdate(postCtx(session, { ids: [id1], action: 'watermark_off' }));
    expect(off.status).toBe(200);
    expect(db.select().from(schema.galleryPhotos).all().find((r) => r.id === id1)!.watermarked).toBe(0);
  });

  it('前台 getGallery：加水印本地照片 image 替换为 /watermarked/:id?v=指纹', async () => {
    setWmSetting(validConfig());
    const wmId = seedPhoto({ watermarked: 1 });
    const plainId = seedPhoto({ watermarked: 0 });
    const items = await getGallery();
    const wmItem = items.find((i) => i.id === String(wmId))!;
    const plainItem = items.find((i) => i.id === String(plainId))!;
    // URL 带配置指纹：配置变更后浏览器缓存自动失效（修复「设置不生效」的关键）
    expect(wmItem.image).toMatch(new RegExp(`^/watermarked/${wmId}\\?v=[0-9a-f]{16}$`));
    expect(plainItem.image).toBe(`/uploads/${BASE_FILE}`);
    expect(wmItem.watermarked).toBe(true);
  });

  it('未配置水印图时前台 image 保持原图路径（无指纹）', async () => {
    const wmId = seedPhoto({ watermarked: 1 });
    const items = await getGallery();
    expect(items.find((i) => i.id === String(wmId))!.image).toBe(`/uploads/${BASE_FILE}`);
  });

  it('配置变更后水印 URL 指纹变化（浏览器强制重新拉取）', async () => {
    setWmSetting(validConfig());
    const wmId = seedPhoto({ watermarked: 1 });
    const before = (await getGallery()).find((i) => i.id === String(wmId))!.image;
    setWmSetting(validConfig({ position: 'top-left', posX: 0, posY: 0 }));
    const after = (await getGallery()).find((i) => i.id === String(wmId))!.image;
    expect(before).not.toBe(after);
  });

  it('后台 getAllGallery：保留原图路径（管理端需要原图）', async () => {
    const wmId = seedPhoto({ watermarked: 1 });
    const items = await getAllGallery();
    expect(items.find((i) => i.id === String(wmId))!.image).toBe(`/uploads/${BASE_FILE}`);
  });

  it('外部 URL 照片即使开水印也不替换路由（无法烘焙）', async () => {
    const id = seedPhoto({ image: 'https://example.com/ext.jpg', watermarked: 1 });
    const items = await getGallery();
    expect(items.find((i) => i.id === String(id))!.image).toBe('https://example.com/ext.jpg');
  });
});
