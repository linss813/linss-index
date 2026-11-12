// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

/**
 * Astro SSR 站点配置
 * V2：从 static 升级为 SSR 模式，由 Node Adapter 驱动
 * 生产环境：Nginx → Node.js (Astro SSR) → SQLite
 */
export default defineConfig({
  // 生产域名（sitemap / canonical 依赖此配置）
  site: 'https://luen0511.com',
  // SSR 输出模式，支持动态读取数据库 + 后台管理 API
  output: 'server',
  // Node.js Adapter：生产环境使用 pm2/systemd 托管
  adapter: node({ mode: 'standalone' }),
  // 登录状态由 Astro Session 通过 HttpOnly Cookie 关联，默认保持 30 天；
  // Node 适配器使用持久化文件存储，服务重启后不会丢失会话。
  session: {
    ttl: 60 * 60 * 24 * 30,
  },
  // CSRF Origin 检查说明：
  // Astro 7 默认开启 checkOrigin，对 multipart/form-data 等「表类型」请求
  // 校验 Origin 头与请求 URL 的 origin 完全一致。生产环境 Nginx 终止 TLS 后
  // 反代到 Node（http），浏览器 Origin 为 https:// 而服务端 URL 为 http://，
  // 协议不一致会被误判为跨站提交，导致手机端上传 403。
  // 本系统所有写操作均为会话鉴权 API（会话 Cookie 为 SameSite=Lax，
  // 跨站请求不会携带），关闭该检查不影响实际安全性。
  // 如未来重新开启，需同时配置 security.allowedDomains 并让 Nginx
  // 转发 X-Forwarded-Proto / X-Forwarded-Host。
  security: {
    checkOrigin: false,
    // 只信任站点自身与本地开发 Host 的转发头。Node adapter 在 Host
    // 命中此白名单后才会使用 X-Forwarded-For 计算 clientAddress，确保
    // 登录限流/审计日志记录真实客户端，而不是把所有请求记到 Nginx。
    allowedDomains: [
      { protocol: 'https', hostname: 'luen0511.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  // V1 构建产物 / 上传文件等不参与 SSR 的静态资源仍由此提供
  // SQLite 数据库与上传文件通过 .gitignore 排除
});
