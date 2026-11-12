import { z } from 'zod';
export const HOME_MODULES = {
  writing: '最新文章',
  featured: '精选服务入口',
  services: '其他服务入口',
  tools: '便捷工具',
  moments: '日常动态',
  guestbook: '访客留言',
} as const;
export type HomeModule = keyof typeof HOME_MODULES;
export const DEFAULT_HOME_ORDER = Object.keys(HOME_MODULES) as HomeModule[];
export const homeOrderSchema = z
  .array(
    z.enum([
      'writing',
      'featured',
      'services',
      'tools',
      'moments',
      'guestbook',
    ]),
  )
  .length(6)
  .refine((ids) => new Set(ids).size === 6, '每个首页模块必须且只能出现一次');
export function resolveHomeOrder(raw: string): HomeModule[] {
  try {
    const result = homeOrderSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : [...DEFAULT_HOME_ORDER];
  } catch {
    return [...DEFAULT_HOME_ORDER];
  }
}
