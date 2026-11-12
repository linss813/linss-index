/**
 * 环境变量读取工具
 * 集中管理所有环境变量，提供类型安全的访问接口
 */

/** 读取环境变量，未设置时返回默认值 */
function env(key: string, fallback: string = ''): string {
  return process.env[key] ?? fallback;
}

/** 读取数字型环境变量 */
function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

export const envConfig = {
  /** SQLite 数据库文件路径 */
  databaseUrl: env('DATABASE_URL', './data/luen0511-home/database.sqlite'),
  /** Session 加密密钥 */
  sessionSecret: env('SESSION_SECRET', 'dev-secret-change-in-production'),
  /** 初始管理员密码（仅首次启动使用） */
  adminInitialPassword: env('ADMIN_INITIAL_PASSWORD', 'admin123456'),
  /** 文件上传目录 */
  uploadDir: env('UPLOAD_DIR', './data/luen0511-home/uploads'),
  /** 最大上传文件大小（字节） */
  maxUploadSize: envInt('MAX_UPLOAD_SIZE', 10 * 1024 * 1024),
  /** RSS 定时同步开关与周期（分钟） */
  rssSyncEnabled: env('RSS_SYNC_ENABLED', 'true').toLowerCase() !== 'false',
  rssSyncIntervalMinutes: Math.max(envInt('RSS_SYNC_INTERVAL_MINUTES', 30), 5),
  /** 监听端口 */
  port: envInt('PORT', 4321),
  /** 运行环境 */
  nodeEnv: env('NODE_ENV', 'development'),
  /** 是否为开发环境 */
  isDev: env('NODE_ENV', 'development') === 'development',
  /** 是否为生产环境 */
  isProd: env('NODE_ENV', 'development') === 'production',
} as const;
