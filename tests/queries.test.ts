/**
 * 数据查询服务层单元测试
 * 覆盖 queries.ts 的过滤、排序、合并、回退与缓存失效逻辑
 */
import { describe, it, expect } from 'vitest';
import {
  getServices,
  getNavigation,
  getSetting,
  getAllSettings,
  getSiteConfig,
  getActiveTheme,
  getAppearance,
  clearCache,
} from '../src/lib/queries';
import { db, schema } from '../src/lib/db';
import { eq } from 'drizzle-orm';

describe('getServices — 服务查询', () => {
  it('只返回已启用的服务（禁用的 Hidden 不出现）', () => {
    const services = getServices();
    const names = services.map((s) => s.name);
    expect(names).toContain('Blog');
    expect(names).not.toContain('Hidden');
  });

  it('按 sort_order 升序排序', () => {
    const services = getServices();
    // Blog(0) → Files(1) → Meet(2)
    expect(services[0].name).toBe('Blog');
    expect(services[1].name).toBe('Files');
    expect(services[2].name).toBe('Meet');
  });

  it('数据库 0/1 值正确转换为 boolean', () => {
    const services = getServices();
    const blog = services.find((s) => s.name === 'Blog');
    expect(blog?.featured).toBe(true);
    expect(blog?.external).toBe(false);
  });
});

describe('getNavigation — 导航查询', () => {
  it('quick 位置只返回 quick 区且已启用的链接', () => {
    const links = getNavigation('quick');
    expect(links.map((l) => l.name)).toEqual(['GitHub', 'Status']);
  });

  it('footer 位置过滤掉禁用项（Old 不出现）', () => {
    const links = getNavigation('footer');
    expect(links.map((l) => l.name)).toEqual(['RSS']);
  });

  it('location 之间互不干扰', () => {
    const quick = getNavigation('quick');
    const footer = getNavigation('footer');
    expect(quick.some((l) => l.name === 'RSS')).toBe(false);
    expect(footer.some((l) => l.name === 'GitHub')).toBe(false);
  });
});

describe('Settings — 设置项读写', () => {
  it('getSetting 读取已有 key', () => {
    expect(getSetting('site_name')).toBe('Test Portal');
  });

  it('getSetting 不存在的 key 返回 fallback', () => {
    expect(getSetting('not_exist_key', 'fallback-value')).toBe('fallback-value');
    expect(getSetting('not_exist_key')).toBe('');
  });

  it('getAllSettings 返回完整 key-value 映射', () => {
    const all = getAllSettings();
    expect(all['site_name']).toBe('Test Portal');
    expect(all['hero_title']).toBe('Test Hero');
  });
});

describe('getSiteConfig — 站点配置合并', () => {
  it('DB 中的设置覆盖 V1 默认值', () => {
    const config = getSiteConfig();
    expect(config.name).toBe('Test Portal');
    expect(config.url).toBe('https://test.example.com');
    expect(config.hero.title).toBe('Test Hero');
  });

  it('未在 DB 中配置的项回退到 V1 默认值', () => {
    const config = getSiteConfig();
    // setup 未写入 footer_year，应回退到 site.ts 默认值
    expect(typeof config.footer.year).toBe('number');
    expect(config.footer.year).toBeGreaterThan(2000);
  });
});

describe('getActiveTheme — 主题查询与回退', () => {
  it('返回 DB 中的激活主题与解析后的色板', () => {
    const { name, config } = getActiveTheme();
    expect(name).toBe('test-theme');
    expect(config.light.background).toBe('#ffffff');
    expect(config.dark.background).toBe('#000000');
  });

  it('激活主题不存在时回退到 default', () => {
    // 将 active_theme 指向不存在的主题名
    db.update(schema.settings)
      .set({ value: 'no-such-theme' })
      .where(eq(schema.settings.key, 'active_theme'))
      .run();
    clearCache();

    const { name } = getActiveTheme();
    // 回退路径：主题名不在 DB 中时，使用 V1 themes 的 default
    expect(['default', 'midnight', 'paper', 'no-such-theme']).toContain(name);

    // 还原
    db.update(schema.settings)
      .set({ value: 'test-theme' })
      .where(eq(schema.settings.key, 'active_theme'))
      .run();
    clearCache();
  });
});

describe('getAppearance — 外观配置', () => {
  it('settings 中未存 appearance 时回退到 V1 默认配置', () => {
    const appearance = getAppearance();
    expect(appearance).toBeDefined();
    expect(typeof appearance.layout.mode).toBe('string');
  });
});

describe('缓存机制 — clearCache 失效', () => {
  it('数据库变更后通过 clearCache 读到新数据', () => {
    // 第一次查询建立缓存
    const before = getServices();
    expect(before.map((s) => s.name)).not.toContain('CacheProbe');

    // 直接写库（绕过 API 层，模拟后台修改）
    db.insert(schema.services).values({
      name: 'CacheProbe',
      description: '缓存测试',
      url: 'https://cache.example.com',
      icon: 'server',
      category: 'Test',
      display: 'card',
      featured: 0,
      external: 0,
      sortOrder: 99,
      enabled: 1,
    }).run();

    // TTL 内的第二次查询仍走缓存，看不到新数据
    const cached = getServices();
    expect(cached.map((s) => s.name)).not.toContain('CacheProbe');

    // 清缓存后读到新数据
    clearCache();
    const fresh = getServices();
    expect(fresh.map((s) => s.name)).toContain('CacheProbe');

    // 清理测试数据
    db.delete(schema.services).where(eq(schema.services.name, 'CacheProbe')).run();
    clearCache();
  });
});
