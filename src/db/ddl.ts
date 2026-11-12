/**
 * 数据库 DDL
 * 建表语句的唯一定义，供初始化脚本（init.ts）与单元测试（tests/setup.ts）共用
 * 避免两份 SQL 漂移
 */
import type Database from 'better-sqlite3';

/**
 * 在指定数据库连接上创建全部表结构与索引（幂等，已存在则跳过）
 * @param sqlite better-sqlite3 数据库连接实例
 */
export function createTables(sqlite: Database.Database): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS moments(id INTEGER PRIMARY KEY,content TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY,article_id INTEGER,name TEXT NOT NULL,content TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  );
  const additions: Record<string, Record<string, string>> = {
    moments: {
      images_json: "TEXT NOT NULL DEFAULT '[]'",
      link: "TEXT NOT NULL DEFAULT ''",
      tags: "TEXT NOT NULL DEFAULT ''",
      pinned: 'INTEGER NOT NULL DEFAULT 0',
      deleted_at: 'TEXT',
      updated_at: 'TEXT',
    },
    comments: {
      email: "TEXT NOT NULL DEFAULT ''",
      website: "TEXT NOT NULL DEFAULT ''",
      avatar: "TEXT NOT NULL DEFAULT ''",
      parent_id: 'INTEGER',
      is_admin: 'INTEGER NOT NULL DEFAULT 0',
      moment_id: 'INTEGER',
      deleted: 'INTEGER NOT NULL DEFAULT 0',
      moderated: 'INTEGER NOT NULL DEFAULT 0',
    },
  };
  for (const [table, fields] of Object.entries(additions)) {
    const columns = new Set(
      (
        sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
          name: string;
        }[]
      ).map((c) => c.name),
    );
    for (const [name, type] of Object.entries(fields))
      if (!columns.has(name))
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  sqlite.exec(
    'CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(article_id,moment_id,approved,parent_id); CREATE INDEX IF NOT EXISTS idx_moments_public ON moments(visible,deleted_at,pinned,id);',
  );
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS article_drafts(article_id INTEGER PRIMARY KEY,document_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  );
  sqlite.exec(`
    -- 1. admins 管理员
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    -- 2. settings 网站基础配置（key-value）
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. services 服务列表
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'server',
      category TEXT NOT NULL DEFAULT '',
      display TEXT NOT NULL DEFAULT 'card',
      featured INTEGER NOT NULL DEFAULT 0,
      external INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. navigation 导航链接
    CREATE TABLE IF NOT EXISTS navigation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      icon TEXT,
      location TEXT NOT NULL DEFAULT 'footer',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      external INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 5. projects 项目
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover TEXT,
      tech_stack TEXT,
      github_url TEXT,
      demo_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. home_sections 首页区块
    CREATE TABLE IF NOT EXISTS home_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 7. themes 主题色板
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. wallpapers 壁纸
    CREATE TABLE IF NOT EXISTS wallpapers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      size INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 9. seo SEO 配置
    CREATE TABLE IF NOT EXISTS seo (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. admin_logs 管理员操作日志
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target TEXT,
      target_id INTEGER,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 11. gallery_photos 相册照片
    CREATE TABLE IF NOT EXISTS gallery_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      image TEXT NOT NULL,
      thumbnail TEXT,
      album_id INTEGER,
      category TEXT,
      date TEXT,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      mime_type TEXT,
      metadata TEXT,
      taken_at TEXT,
      watermarked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. gallery_albums 相册分组
    CREATE TABLE IF NOT EXISTS gallery_albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      cover TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 13. rss_categories RSS 来源分类
    CREATE TABLE IF NOT EXISTS rss_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 14. rss_sources RSS / Atom 订阅源
    CREATE TABLE IF NOT EXISTS rss_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rss_url TEXT NOT NULL UNIQUE,
      site_url TEXT,
      sitemap_url TEXT,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT,
      cover TEXT,
      category_id INTEGER REFERENCES rss_categories(id) ON DELETE SET NULL,
      display_type TEXT NOT NULL DEFAULT 'secondary',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 15. rss_articles RSS 同步文章（隐藏不删除，历史长期保留）
    CREATE TABLE IF NOT EXISTS rss_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES rss_sources(id) ON DELETE SET NULL,
      source_name TEXT NOT NULL,
      source_site_url TEXT,
      guid TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      original_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT,
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      content_text TEXT NOT NULL DEFAULT '',
      cover_url TEXT,
      categories_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      published_at TEXT,
      source_updated_at TEXT,
      content_hash TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      visible INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0,
      pin_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_id, guid)
    );

    -- 16. rss_sync_state 定时同步租约与最近状态（固定单行 id=1）
    CREATE TABLE IF NOT EXISTS rss_sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      locked_until TEXT,
      last_started_at TEXT,
      last_finished_at TEXT,
      last_error TEXT
    );
    INSERT OR IGNORE INTO rss_sync_state (id) VALUES (1);

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
    CREATE INDEX IF NOT EXISTS idx_services_enabled ON services(enabled);
    CREATE INDEX IF NOT EXISTS idx_nav_location ON navigation(location);
    CREATE INDEX IF NOT EXISTS idx_nav_enabled ON navigation(enabled);
    CREATE INDEX IF NOT EXISTS idx_projects_enabled ON projects(enabled);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON admin_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_gallery_published ON gallery_photos(published);
    CREATE INDEX IF NOT EXISTS idx_albums_published ON gallery_albums(published);
    CREATE INDEX IF NOT EXISTS idx_rss_sources_enabled ON rss_sources(enabled);
    CREATE INDEX IF NOT EXISTS idx_rss_sources_category ON rss_sources(category_id);
    CREATE INDEX IF NOT EXISTS idx_rss_sources_display ON rss_sources(display_type);
    CREATE INDEX IF NOT EXISTS idx_rss_articles_source ON rss_articles(source_id);
    CREATE INDEX IF NOT EXISTS idx_rss_articles_visible_date ON rss_articles(visible, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rss_articles_pinned ON rss_articles(visible, pinned, pin_order, published_at DESC);
  `);

  migrateRssArticleColumns(sqlite);

  // SQLite FTS5 为标题和正文搜索提供倒排索引；触发器确保同步、编辑、删除后索引一致。
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS rss_articles_fts USING fts5(
      title, summary, content_text,
      content='rss_articles', content_rowid='id',
      tokenize='unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS rss_articles_ai AFTER INSERT ON rss_articles BEGIN
      INSERT INTO rss_articles_fts(rowid, title, summary, content_text)
      VALUES (new.id, new.title, new.summary, new.content_text);
    END;
    CREATE TRIGGER IF NOT EXISTS rss_articles_ad AFTER DELETE ON rss_articles BEGIN
      INSERT INTO rss_articles_fts(rss_articles_fts, rowid, title, summary, content_text)
      VALUES ('delete', old.id, old.title, old.summary, old.content_text);
    END;
    CREATE TRIGGER IF NOT EXISTS rss_articles_au AFTER UPDATE OF title, summary, content_text ON rss_articles BEGIN
      INSERT INTO rss_articles_fts(rss_articles_fts, rowid, title, summary, content_text)
      VALUES ('delete', old.id, old.title, old.summary, old.content_text);
      INSERT INTO rss_articles_fts(rowid, title, summary, content_text)
      VALUES (new.id, new.title, new.summary, new.content_text);
    END;
  `);

  // v2.3.0 及之前创建的 gallery_photos 表缺少 v2.4.0 新增列，先补齐列再建依赖新列的索引（幂等）
  migrateGalleryColumns(sqlite);

  // album_id 索引依赖迁移补齐的列，必须在 migrateGalleryColumns 之后创建
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_gallery_album ON gallery_photos(album_id);`,
  );
}

/** 为开发期间已创建的 RSS 文章表补齐内容指纹字段。 */
function migrateRssArticleColumns(sqlite: Database.Database): void {
  const columns = new Set(
    (
      sqlite.prepare(`PRAGMA table_info(rss_articles)`).all() as {
        name: string;
      }[]
    ).map((column) => column.name),
  );
  if (!columns.has('source_updated_at'))
    sqlite.exec(`ALTER TABLE rss_articles ADD COLUMN source_updated_at TEXT`);
  if (!columns.has('content_hash'))
    sqlite.exec(
      `ALTER TABLE rss_articles ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''`,
    );
  if (!columns.has('content_markdown'))
    sqlite.exec(`ALTER TABLE rss_articles ADD COLUMN content_markdown TEXT`);
  if (!columns.has('save_version'))
    sqlite.exec(
      'ALTER TABLE rss_articles ADD COLUMN save_version INTEGER NOT NULL DEFAULT 0',
    );
  if (!columns.has('content_json'))
    sqlite.exec(`ALTER TABLE rss_articles ADD COLUMN content_json TEXT`);
  if (!columns.has('deleted_at'))
    sqlite.exec(`ALTER TABLE rss_articles ADD COLUMN deleted_at TEXT`);
}

/**
 * 为已存在的 gallery_photos 表补齐新增列（幂等，缺列才 ALTER）
 * 覆盖 v2.4.0（EXIF / 尺寸列）与 v2.6.0（watermarked 水印标记列）
 * @param sqlite better-sqlite3 数据库连接实例
 */
function migrateGalleryColumns(sqlite: Database.Database): void {
  const columns = new Set(
    (
      sqlite.prepare(`PRAGMA table_info(gallery_photos)`).all() as {
        name: string;
      }[]
    ).map((c) => c.name),
  );
  /** 需要保证存在的列定义（列名 → DDL 片段） */
  const required: Record<string, string> = {
    album_id: 'INTEGER',
    width: 'INTEGER',
    height: 'INTEGER',
    file_size: 'INTEGER',
    mime_type: 'TEXT',
    metadata: 'TEXT',
    taken_at: 'TEXT',
    // v2.6.0：水印标记（SQLite ALTER 添加 NOT NULL 列必须带非空默认值）
    watermarked: 'INTEGER NOT NULL DEFAULT 0',
  };
  for (const [name, def] of Object.entries(required)) {
    if (!columns.has(name)) {
      sqlite.exec(`ALTER TABLE gallery_photos ADD COLUMN ${name} ${def}`);
    }
  }
}
