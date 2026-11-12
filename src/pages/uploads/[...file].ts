/**
 * 上传文件静态服务路由
 * GET /uploads/:filename — 提供 data/uploads 目录中的文件（壁纸等）
 *
 * 背景修复说明：此前上传的壁纸仅保存到磁盘并在数据库记录了 /uploads/xxx 路径，
 * 但服务器没有对应路由，访问一律 404，导致背景图无法显示；
 * 本路由补齐「存储 → 访问」链路，开发与生产环境均可直接使用，
 * 生产环境也可改为由 Nginx 直接映射 uploadDir（性能更优）。
 */
import type { APIRoute } from 'astro';
import { envConfig } from '../../lib/env';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

/** 扩展名 → MIME 类型映射（仅允许图片） */
const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export const GET: APIRoute = async ({ params }) => {
  // rest 参数可能包含子路径，仅取最后一段文件名
  const raw = (params.file ?? '').split(/[\\/]/).pop() ?? '';

  // 严格校验文件名：只允许字母数字、下划线、点与连字符，且必须带图片扩展名
  // 随机上传文件名为 32 位 hex + 扩展名；该校验同时阻断路径穿越（..、分隔符）
  if (!/^[A-Za-z0-9._-]+$/.test(raw)) {
    return new Response('Not Found', { status: 404 });
  }
  const ext = extname(raw).toLowerCase();
  const mime = EXT_MIME[ext];
  if (!mime) {
    return new Response('Not Found', { status: 404 });
  }

  // 双保险：解析绝对路径后确认仍位于上传目录内
  const baseDir = resolve(envConfig.uploadDir);
  const filePath = resolve(baseDir, raw);
  if (filePath !== baseDir && !filePath.startsWith(baseDir + sep)) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': mime,
        // 随机文件名内容不可变，可长缓存
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
};
