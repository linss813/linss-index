import { z } from 'zod';
import { sqlite } from '../lib/db';
import { randomUUID } from 'node:crypto';
const url = z
  .string()
  .max(1000)
  .refine(
    (v) => !v || /^\/(?!\/)/.test(v) || /^https?:\/\//.test(v),
    '请输入站内路径或HTTP(S)网址',
  );
export const sidebarModule = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum([
      'profile',
      'links',
      'articles',
      'moments',
      'guestbook',
      'stats',
      'ad',
      'text',
    ]),
    title: z.string().trim().min(1).max(80),
    side: z.enum(['left', 'right']),
    enabled: z.boolean(),
    mobile: z.boolean().default(true),
    desktop: z.boolean().optional(),
    tablet: z.boolean().optional(),
    imageAlt: z.string().max(150).optional(),
    profileName: z.string().max(50).optional(),
    order: z.number().int().min(0).max(100).optional(),
    sort: z.enum(['published', 'updated']).optional(),
    thumbnail: z.boolean().optional(),
    metrics: z.array(z.enum(['文章', '动态', '留言'])).optional(),
    content: z.string().max(2000).default(''),
    contentHtml: z.string().max(20000).optional(),
    url: url.default(''),
    image: url.default(''),
    limit: z.number().int().min(1).max(6).default(3),
    links: z
      .array(
        z.object({
          name: z.string().min(1).max(40),
          url,
          icon: z.string().max(40).default('globe'),
        }),
      )
      .max(12)
      .default([]),
  })
  .superRefine((m, ctx) => {
    if (m.kind === 'profile' && m.content.length > 80)
      ctx.addIssue({
        code: 'custom',
        path: ['content'],
        message: '站点简介最多80字',
      });
    if (m.kind === 'profile' && m.links.length > 5)
      ctx.addIssue({
        code: 'custom',
        path: ['links'],
        message: '社交入口最多5个',
      });
  });
export const sidebarDocument = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    width: z
      .union([z.literal(180), z.literal(220), z.literal(260)])
      .default(220),
    modules: z.array(sidebarModule).max(16),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.modules.map((m) => m.id)).size !== v.modules.length)
      ctx.addIssue({ code: 'custom', message: '模块ID重复' });
    for (const side of ['left', 'right'])
      if (v.modules.filter((m) => m.side === side).length > 8)
        ctx.addIssue({ code: 'custom', message: '每栏最多8个模块' });
  });
export type SidebarModule = z.infer<typeof sidebarModule>;
export type SidebarDocument = z.infer<typeof sidebarDocument>;
export function moduleTemplate(
  kind: SidebarModule['kind'],
  side: 'left' | 'right' = 'left',
): SidebarModule {
  const names = {
    profile: '关于这里',
    links: '随手打开',
    articles: '最近文章',
    moments: '日常片刻',
    guestbook: '留言墙',
    stats: '记录统计',
    ad: '推荐',
    text: '一段话',
  };
  return {
    id: randomUUID(),
    kind,
    title: names[kind],
    side,
    enabled: true,
    mobile: kind !== 'ad' && kind !== 'stats',
    content: kind === 'profile' ? '记录日常，分享微小的发现。' : '',
    url: '',
    image: '',
    limit: kind === 'moments' ? 2 : 3,
    links:
      kind === 'links'
        ? [
            { name: '实用工具', url: '/tools', icon: 'terminal' },
            { name: '照片相册', url: '/gallery', icon: 'image' },
            { name: '文章归档', url: '/blog/archive', icon: 'book-open' },
          ]
        : [],
  };
}
function read(key: string) {
  const row = sqlite
    .prepare('SELECT value FROM settings WHERE key=?')
    .get(key) as { value: string } | undefined;
  try {
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  sqlite
    .prepare(
      'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    )
    .run(key, JSON.stringify(value));
}
function parseSavedDocument(value: unknown) {
  const full = sidebarDocument.safeParse(value);
  if (full.success) return full;
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as any).modules)
  ) {
    const raw = value as any;
    const seen = new Set<string>();
    const modules: SidebarModule[] = [];
    for (const item of raw.modules) {
      const parsed = sidebarModule.safeParse(item);
      if (
        parsed.success &&
        !seen.has(parsed.data.id) &&
        modules.filter((m) => m.side === parsed.data.side).length < 8
      ) {
        modules.push(parsed.data);
        seen.add(parsed.data.id);
      }
    }
    return sidebarDocument.safeParse({ ...raw, modules });
  }
  return full;
}
export function getSidebarState() {
  const raw = read('sidebar_published');
  const saved = parseSavedDocument(raw);
  let published: SidebarDocument;
  if (saved.success) published = saved.data;
  else {
    const modules = [
      moduleTemplate('profile'),
      moduleTemplate('links'),
      moduleTemplate('articles'),
      moduleTemplate('moments', 'right'),
      moduleTemplate('guestbook', 'right'),
    ];
    const legacy = read('home_sidebar');
    if (Array.isArray(legacy))
      legacy.slice(0, 11).forEach((c: any) => {
        const parsed = sidebarModule.safeParse({
          ...moduleTemplate(
            c.kind === 'ad' ? 'ad' : c.kind === 'link' ? 'links' : 'text',
            c.side === 'right' ? 'right' : 'left',
          ),
          title: c.title || '卡片',
          content: c.content || '',
          url: c.url || '',
          enabled: c.enabled !== false,
        });
        if (
          parsed.success &&
          modules.filter((m) => m.side === parsed.data.side).length < 8
        )
          modules.push(parsed.data);
      });
    published = { schemaVersion: 1, revision: 0, width: 220, modules };
  }
  if (!saved.success) {
    published.width = 260;
    published.modules.forEach(
      (m, index) => (m.id = `initial-${index}-${m.kind}`),
    );
  }
  const draft = parseSavedDocument(read('sidebar_draft'));
  return {
    published,
    warnings:
      raw && !sidebarDocument.safeParse(raw).success
        ? ['部分旧模块格式无效，已跳过；请检查后重新保存。']
        : [],
    draft: draft.success ? draft.data : published,
    history: (Array.isArray(read('sidebar_history'))
      ? read('sidebar_history')
      : []
    )
      .filter(
        (item: any) =>
          typeof item?.time === 'string' &&
          sidebarDocument.safeParse(item.document).success,
      )
      .slice(0, 10) as { time: string; document: SidebarDocument }[],
  };
}
export function saveSidebar(
  document: SidebarDocument,
  action: 'save' | 'publish',
) {
  return sqlite.transaction(() => {
    const state = getSidebarState();
    if (document.revision !== state.draft.revision) return null;
    const next = { ...document, revision: document.revision + 1 };
    write('sidebar_draft', next);
    if (action === 'publish') {
      write(
        'sidebar_history',
        [
          { time: new Date().toISOString(), document: state.published },
          ...state.history,
        ].slice(0, 10),
      );
      write('sidebar_published', next);
    }
    return next;
  })();
}
