# Luen0511 Home

基于 Astro SSR 的个人服务器门户首页与后台管理系统，作为 [luen0511.com](https://luen0511.com) 的统一入口。

> 轻量全栈：前台 Editorial 排版 + 后台可视化管理 + SQLite 单文件存储。
> 当前版本：v2.10.0（完整演进见 [开发记录.md](./开发记录.md)）

## 技术栈

- [Astro 7](https://astro.build)（SSR 模式，`@astrojs/node` 适配器）
- TypeScript（strict 模式）
- SQLite + [Drizzle ORM](https://orm.drizzle.team)（better-sqlite3，单文件零运维）
- [Zod](https://zod.dev)（请求参数校验）
- [exifr](https://github.com/MikeKovarik/exifr)（照片 EXIF 元数据解析）
- [qrcode](https://github.com/soldair/node-qrcode)（浏览器本地二维码生成与 PNG 导出）
- [sharp](https://sharp.pixelplumbing.com)（服务端图片处理：水印烘焙合成；原生二进制优先，老 CPU 自动降级 `@img/sharp-wasm32` WASM 运行时）
- [Vitest](https://vitest.dev)（单元测试，19 个测试文件 / 234 个用例）
- 原生 CSS（Design Token + CSS Variables 设计系统，无 UI 框架）

## 功能特性

### 前台门户

- **Editorial 排版首页**：Typography / 留白 / hairline 分隔线驱动，grid / list / mixed 三种布局
- **相册 Gallery**：Masonry 瀑布流（按真实图片比例排版）、相册过滤导航；本地照片按需生成并磁盘缓存 640px WebP 缩略图与 1920px WebP 高清预览，Lightbox 先显示缩略图再淡入预览，可在当前灯箱切换完整原图而不跳转图片 URL；支持友好加载提示、按动画帧合并的流畅滚轮缩放、仅按住时拖动、触摸手势、底部缩略图条、键盘切换与相邻预览预加载
- **图片信息面板**：尺寸 / 宽高比 / 文件大小 / 格式 / EXIF（相机、镜头、焦距、光圈、快门、ISO、拍摄时间）双列毛玻璃面板；标题与描述持久化展示；图片支持浏览器原生右键菜单（复制图片地址等）
- **图片水印**：服务端 sharp 烘焙（水印直接合成进图片字节，右键保存 / 下载即为带水印版本）；完整 JPEG 使用质量 100、4:4:4 色度采样并保留 ICC 色彩配置（不复制 EXIF/GPS），按「照片 ID + 配置及渲染版本指纹」磁盘缓存并自动失效；水印图经 `/watermarked/:id` 路由提供，原始上传地址不对外暴露
- **三套预设主题**（default / midnight / paper），浅色 + 深色双模式，深色色板为柔和深色系
- **背景系统**：纯色 / 渐变 / 本地上传图片 / 图床随机图 URL，支持遮罩、模糊、显示模式
- **主题切换**：Light / Dark / System 三档偏好记忆
- **移动端响应式**：前台瀑布流 3 / 2 / 1 列断点、Lightbox 触控按钮 ≥44px；后台侧边栏抽屉化 + 汉堡键、表格横向滚动、弹窗表单触控适配、刘海屏安全区（`env(safe-area-inset-*)`）
- **RSS 文章中心**：多来源 RSS / Atom 定时同步并持久化到 SQLite；首页独立展示置顶文章与最新 10 篇普通文章，提供文章来源标识、全文详情、分类动态、时间归档、全文搜索和分页
- **便捷工具中心**：紧凑工作台集中提供 JSON、时间戳、Base64、URL 编解码、UUID、SHA-256、JWT、进制联动转换、文本统计、密码与随机数生成、概率抽奖、正则测试、颜色转换及二维码生成；严格校验无效输入，敏感内容默认在浏览器本地处理
- **站内快捷入口与外链提醒**：首页快捷跳转固定提供工具、相册和 Blog，访问第三方网站前统一展示目标域名与离站确认
- **SEO 基础设施**：动态 `/sitemap.xml` 收录公开页面与可见文章，输出内容更新时间、抓取频率和优先级；`robots.txt` 声明 Sitemap，页面统一生成 canonical、Open Graph 与 Twitter Card 元数据

### 后台管理

- **登录认证**：bcrypt 密码哈希 + 服务端会话 + IP 维度登录限流（15 分钟 5 次失败锁定）
- **仪表盘**：运行概览、快捷操作入口
- **相册 Gallery 管理**：
  - 相册 CRUD（仅名称必填、排序自动递增、编辑数据完整回填）
  - 多文件拖拽上传：先选目标相册 → 文件入队 → 确认后上传，进度条 / 失败重试 / 类型与大小校验
  - 照片列表：缩略图（固定尺寸棋盘格 contain）、尺寸/文件大小/拍摄时间展示、相册筛选、**批量发布 / 隐藏 / 移动相册 / 删除**
  - 照片编辑弹窗（标题 / 描述，字段校验与错误反馈）、一键复制图片直链
  - EXIF 自动解析入库；**元数据公开配置**（GPS 等敏感字段默认不向前台下发）
  - **水印设置**：上传水印图（推荐透明背景 PNG）、九宫格预设位置、不透明度 / 宽度 / 边距滑杆（卡片式布局 + 实时效果预览）；支持逐照片开关水印，配置保存后已开启水印的照片立即重合成
- **统一后台列表 UI**：表头、行高、文字层级、状态 Badge、缩略图与操作按钮采用统一视觉规范；支持行 hover/选中反馈、加载与空数据状态；Gallery 照片列表提供关键词搜索、相册筛选、每页数量与分页，并将低频操作收纳到“更多”菜单
- **内容管理**：服务 / 项目 / 导航链接的增删改查、启用禁用、批量选择与批量删除
- **壁纸与背景**：上传（缩略图预览、点击大图预览）、**Canvas 裁剪**（自由拖拽 / 八方向调整 / 比例锁定）、一键设为背景、预设色库、实时预览
- **主题编辑器**：六字段色板编辑、颜色展示、实时预览弹窗
- **RSS 管理**：订阅源与分类 CRUD、主/次 RSS 模式、连接测试与立即同步；文章支持按来源筛选、批量选择、批量隐藏/恢复/置顶/取消置顶/删除，以及单篇优先级调整，缺省封面可配置
- **安全设置**：后台访问路径可自定义（见下）、SEO / 设置 / 管理员管理、操作日志审计

### 安全设计

- **可自定义后台路径**：默认 `/admin` 可在后台「基础设置 → 安全设置」中修改（如 `/secret-panel`）
  - 自定义后旧路径 `/admin/*` 一律返回品牌化 404，404 页面不含任何后台入口
  - `/api/admin/*` 接口同步隐藏：访问后台入口时下发 HMAC 签名的 HttpOnly 入口令牌，无令牌探测一律 404
  - 内部路径重写使用 HMAC 签名标记，外部无法伪造鉴权（签名基于 `SESSION_SECRET`）
- 上传文件名白名单 + 路径穿越防护 + 扩展名/大小限制
- 全部 API 登录鉴权，Zod 参数校验（URL 协议白名单防 XSS、批量 ID 数组校验）
- 密码 bcrypt 10 轮哈希存储，内联 SVG 图标（零外部请求）

## 项目结构

```text
linss-index/
├── src/
│   ├── components/           # 前台组件（Header / Hero / Background / gallery/ 相册组件等）
│   │   └── gallery/          # Gallery：GalleryGrid / GalleryItem / GalleryViewer / GalleryInfoPanel / GalleryThumbnails / GalleryEmpty
│   ├── config/
│   │   ├── theme.ts          # 预设主题色板（default / midnight / paper）
│   │   ├── backgroundPresets.ts # 背景预设库（12 纯色 + 8 渐变）
│   │   └── site.ts           # 站点信息 / 文案
│   ├── db/
│   │   ├── schema.ts         # Drizzle 表结构
│   │   ├── ddl.ts            # 建表 DDL（初始化与测试共用，含增量迁移）
│   │   └── init.ts           # 数据库初始化
│   ├── lib/
│   │   ├── db.ts             # 数据库连接（better-sqlite3）
│   │   ├── auth.ts           # 会话 / 鉴权 / 登录限流 / 操作日志
│   │   ├── admin-path.ts     # 自定义后台路径（校验 / 链接拼接 / HMAC 入口令牌）
│   │   ├── gallery-meta.ts   # EXIF 解析映射 / 图片尺寸探测 / 元数据隐私过滤
│   │   ├── watermark.ts      # 水印合成（sharp 烘焙 / 坐标计算 / 磁盘缓存）
│   │   ├── thumbnail.ts      # Gallery 640px WebP 缩略图（按需生成 / 版本化缓存）
│   │   ├── preview.ts        # Gallery 1920px WebP 高清预览（按需生成 / 版本化缓存）
│   │   ├── env.ts            # 环境变量加载
│   │   └── validation.ts     # Zod 校验规则（URL / 批量 ID 数组等）
│   ├── services/
│   │   ├── gallery.ts        # Gallery 数据服务（公开/后台查询、尺寸懒补全）
│   │   ├── blog.ts           # RSS / Atom 解析、HTML 清理与代码高亮
│   │   ├── rss-sync.ts       # RSS 增量同步、内容哈希去重与持久化
│   │   └── articles.ts       # 文章首页、归档、搜索与详情数据库查询
│   ├── types/
│   │   └── gallery.ts        # Gallery 类型定义与元数据公开默认配置
│   ├── layouts/
│   │   ├── Layout.astro      # 前台全局布局（SEO / Token 注入 / 主题初始化）
│   │   └── AdminLayout.astro # 后台布局（侧边栏 / 全局表格与按钮样式体系）
│   ├── middleware.ts         # 请求中间件（鉴权 / 后台路径重写与隐藏 / 入口令牌）
│   └── pages/
│       ├── index.astro       # 前台首页
│       ├── tools.astro       # 便捷工具中心（编码、转换、抽奖、二维码等）
│       ├── gallery.astro     # 前台相册页
│       ├── sitemap.xml.ts    # 动态 Sitemap（公开页面与可见文章）
│       ├── 404.astro         # 品牌 404 页（不含后台入口）
│       ├── admin/            # 后台页面（登录 / 仪表盘 / 各管理页）
│       ├── api/admin/        # 后台 API（含各资源 batch-delete / batch-update、admin-path）
│       ├── api/gallery/      # 前台公开相册 API
│       ├── watermarked/[id].ts  # 水印图路由（烘焙水印后的照片，原图地址不暴露）
│       ├── thumbnails/[id].ts   # Gallery 缩略图路由（公开图片才可生成/读取）
│       ├── previews/[id].ts     # Gallery 高清预览路由（公开图片才可生成/读取）
│       └── uploads/[...file].ts # 上传文件静态服务（白名单 + 防穿越）
├── tests/                    # Vitest 单元测试（17 个文件 / 227 个用例）
├── drizzle.config.ts         # Drizzle Kit 迁移配置
├── astro.config.mjs          # Astro 配置（SSR + node adapter）
└── vitest.config.ts          # 测试配置（node 环境，内存库隔离）
```

## 环境变量

复制 `.env.example` 为 `.env` 并填写（`.env` 不入库）：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DATABASE_URL` | SQLite 数据库文件路径 | `./data/luen0511-home/database.sqlite` |
| `SESSION_SECRET` | 密钥：会话加密 + 后台入口令牌/重写签名（务必改为随机长字符串） | — |
| `ADMIN_INITIAL_PASSWORD` | 首次启动创建管理员的初始密码 | — |
| `UPLOAD_DIR` | 上传文件目录 | `./data/luen0511-home/uploads` |
| `MAX_UPLOAD_SIZE` | 上传大小上限（字节） | `10485760` |
| `RSS_SYNC_ENABLED` | 是否启用进程内 RSS 定时同步 | `true` |
| `RSS_SYNC_INTERVAL_MINUTES` | RSS 同步周期（分钟，最小 5） | `30` |
| `PORT` | 服务监听端口 | `4321` |
| `NODE_ENV` | 运行环境 | `development` |

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 本地开发（http://localhost:4321）
npm run build        # 构建到 dist/（SSR server 产物）
npm run preview      # 本地预览构建产物
npm run check        # TypeScript / Astro 类型检查
npm test             # 运行单元测试（vitest）

npm run db:init      # 初始化数据库
npm run db:generate  # 生成迁移文件（schema 变更后）
npm run db:migrate   # 执行迁移
npm run db:studio    # Drizzle Studio 数据库可视化管理
npm run rss:sync     # 立即执行一次所有已启用 RSS 来源同步
```

## 原创博客与文章后台

- `/admin/posts`：文章管理，支持搜索、标签筛选、排序、分页、批量发布/转草稿、置顶、复制、回收站和恢复。
- `/admin/write?id=<id>`：编辑现有文章；省略 ID 创建文章。自定义后台路径下请通过菜单进入。
- 编辑器使用 TOAST UI Editor，支持中文富文本、Markdown、实时预览、表格、代码块和 Markdown 文件导入导出。
- Markdown 源文与清洗后的 HTML 一起保存；草稿不会进入公开列表、搜索和文章详情。
- 顶部提供保存、发布和字数状态；Cmd/Ctrl+S 保存草稿，Esc 退出专注模式。
- 左侧目录由正文标题自动生成，右侧支持文章分类。两条分隔线可拖动或使用方向键调整，双击恢复默认宽度；布局保存在当前浏览器。
- 侧栏支持收起并记住状态；专注模式隐藏导航及辅助栏。
- 前台 `/blog`、`/blog/archive` 与 `/blog/<slug>` 提供列表、搜索和长文阅读，包含目录及阅读时间。

升级前请备份 SQLite 数据库及上传目录。运行初始化会幂等补齐 `content_markdown` 和 `deleted_at` 字段，不覆盖既有文章。

## 构建与部署

生产服务器需要安装与项目依赖兼容的 Node.js、Nginx 和证书客户端。原生 SQLite/图片依赖应在目标服务器安装，不要复制 macOS 的 `node_modules`。

1. 配置服务器独立 `.env`，设置随机 `SESSION_SECRET`、强管理员初始密码，以及持久化数据库和上传目录；不要上传本地预览账号或本地测试数据库。
2. 执行 `npm ci`、`npm test`、`npm run check`、`npm run build`。
3. 使用 `node --env-file=.env --import tsx src/db/init.ts` 初始化或迁移数据库。
4. 用 systemd 运行 `node --env-file=.env dist/server/entry.mjs`，配置 `NODE_ENV=production`、`HOST=127.0.0.1`、`PORT=4321`，并设置自动重启。
5. Nginx 代理到本机 4321 端口，保留以下代理头。防火墙先允许当前 SSH 端口，再允许 TCP 80/443，应用端口不对公网开放。
6. 域名 A/AAAA 解析确认指向服务器后，申请公开信任的 SSL 证书，开启 HTTP 到 HTTPS 跳转及证书自动续期。不要为解析不匹配的域名盲目申请证书。

部署后检查前台、后台登录、草稿保存、静态资源、`nginx -t`、systemd 服务状态和证书续期测试。已有站点与防火墙规则需要先盘点，再增量调整。

```bash
npm install
npm run build
npm run db:init      # 首次部署执行
```

SSR 模式需要 Node.js 常驻运行：

```bash
NODE_ENV=production PORT=4321 node dist/server/entry.mjs
```

建议配合 systemd / pm2 守护进程，Nginx 反向代理：

```nginx
server {
    listen 443 ssl;
    server_name luen0511.com;

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # 转发原始协议与主机名（TLS 在 Nginx 层终止，Node 侧需据此识别 https）
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        client_max_body_size 10m;   # 与 MAX_UPLOAD_SIZE 对齐
    }
}
```

> **手机端上传 403 说明**：Astro SSR 默认开启 CSRF Origin 检查（`security.checkOrigin`），
> Nginx 终止 TLS 反代后，浏览器 `Origin: https://…` 与 Node 侧 `http://…` 协议不一致会被
> 误判为跨站提交，导致 multipart 上传 403。本项目已在 `astro.config.mjs` 中关闭该检查
> （写操作均有会话鉴权 + Cookie SameSite=Lax 防护）。若自行重新开启，必须同时配置
> `security.allowedDomains` 并保证上方两个 `X-Forwarded-*` 头已转发。

> 注意：每次 `npm run build` 后必须重启 `node dist/server/entry.mjs`，
> SSR 产物的页面与静态资源 hash 绑定在进程内存中，不重启会导致 CSS/JS 404。

> 注意：图片处理采用「原生 sharp 优先 + WASM 兜底」双运行时（v2.8.0 起）。
> `sharp` 原生二进制要求 CPU 支持 x86-64-v2/SSE4.2；老 CPU（如 QEMU 仅 SSE/SSE2）上
> 会自动切换 `@img/sharp-wasm32` WASM 运行时（已列为直接依赖，`npm install` 必装），
> 水印功能照常可用，仅首次合成较慢（结果磁盘缓存，后续命中缓存）。
> 两种运行时均不可用时，水印合成自动回退原图直出（服务端读取，不暴露 /uploads 路径），不影响前台展示。

## 开发说明

- 版本演进与技术细节见 [开发记录.md](./开发记录.md)（含每次变更的根因分析、方案与验证记录）
- 单元测试（`npm test`，内存 SQLite 隔离，共 17 个文件 / 227 个用例）覆盖：
  - 参数校验（Zod 规则、批量 ID 数组）、环境变量加载
  - 认证（bcrypt 校验、会话读写、登录限流）
  - 数据查询服务（站点配置、Gallery 公开/后台查询、相册过滤与计数）
  - Gallery 元数据：EXIF 解析映射（真实二进制构造）、图片尺寸探测、元数据隐私过滤、配置解析
  - 水印：预设 / 自定义坐标计算、配置解析与边界钳制、缓存指纹与失效、水印配置 API（40 例）
  - 后台 API：相册 CRUD、照片编辑（标题/描述/发布/移动）、批量发布/隐藏/移动/删除、后台路径管理
  - 后台路径工具：格式/保留字校验、HMAC 入口令牌与重写签名（确定性、不可伪造）
  - 背景预设库、时间格式化
- 设计原则：排版优先（Editorial）、可配置但不默认堆满效果、背景层与前景层完全分离、颜色/间距/字体全部走 Design Token
