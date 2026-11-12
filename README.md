# Luen0511 Home

基于 Astro SSR 的个人服务器门户首页与后台管理系统，作为 [luen0511.com](https://luen0511.com) 的统一入口。

> 轻量全栈：前台 Editorial 排版 + 后台可视化管理 + SQLite 单文件存储。
> 最近更新：2026-11-13（完整演进见 [开发记录.md](./开发记录.md)）

## 技术栈

- [Astro 7](https://astro.build)（SSR 模式，`@astrojs/node` 适配器）
- TypeScript（strict 模式）
- SQLite + [Drizzle ORM](https://orm.drizzle.team)（better-sqlite3，单文件零运维）
- [Zod](https://zod.dev)（请求参数校验）
- [exifr](https://github.com/MikeKovarik/exifr)（照片 EXIF 元数据解析）
- [qrcode](https://github.com/soldair/node-qrcode)（浏览器本地二维码生成与 PNG 导出）
- [sharp](https://sharp.pixelplumbing.com)（服务端图片处理：水印烘焙合成；原生二进制优先，老 CPU 自动降级 `@img/sharp-wasm32` WASM 运行时）
- [Vitest](https://vitest.dev)（31 个测试文件 / 282 个用例，含 DOM 交互回归）
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
- 编辑器采用 Tiptap 块编辑：支持斜杠菜单、Markdown 快捷语法、任务列表、代码语言、表格、图片、提示块、折叠块与块移动。旧文章按需转换，无法解析的块 JSON 回落到 HTML 兼容源文，保留原文。
- 带版本号的块 JSON、Markdown 和清洗后的 HTML 一起保存；停止输入两秒后自动保存。已发布文章的修改存入独立编辑草稿，更新发布才替换公开正文。支持版本冲突检测、另存副本和本机未完成编辑恢复。
- 顶部提供保存、发布、草稿预览和字数状态；Cmd/Ctrl+S 保存草稿，Esc 退出专注模式。Markdown/JSON 文件导入前可预览并选择新建或替换；支持 Markdown 与完整 JSON 导出。
- 左侧目录由正文标题自动生成，右侧支持文章分类。两条分隔线可拖动或使用方向键调整，双击恢复默认宽度；布局保存在当前浏览器。
- 侧栏支持收起并记住状态；专注模式隐藏导航及辅助栏。
- 前台 `/blog`、`/blog/archive` 与 `/blog/<slug>` 提供列表、搜索和长文阅读，包含目录及阅读时间。

升级前请备份 SQLite 数据库及上传目录。运行 `npm run db:init` 会幂等补齐块 JSON、保存版本、独立编辑草稿、图片动态与评论回复字段，不覆盖既有文章。公开请求不再执行建表或加字段。


## 首页功能栏与社区

- 「首页内容」可拖动或使用上下移动按钮调整最新文章、精选服务、其他服务、工具、动态和留言板的模块顺序；「首页服务入口」可拖动服务行或使用上下按钮调整单个入口顺序，保存后立即生效。

- 后台「首页侧栏卡片」统一管理介绍、快捷链接、文章、日常、留言、统计、推广和自定义格式文字。支持跨栏拖动、键盘排序、复制、启停、删除撤销、图片上传/媒体库、图标选择，以及设备可见性与移动顺序。
- 配置修改直接进入预览；「保存草稿」与「应用到首页」分离，提供版本校验和最近十个生效版本恢复。预览可选择卡片/真实首页，以及桌面、平板、手机尺寸。
- 桌面双栏固定、超高内容内部滚动；空间不足合并右栏，手机移入正文后。宽度有 180/220/260px 三档；卡片折叠状态保存在当前浏览器。
- 「动态与留言」拆分为日常、评论与展示设置。日常支持九图、排序、替换、失败重试、链接、标签、置顶、草稿与回收站；`/moments` 为分页列表，`/moments/<id>` 为详情。公开图片提供灯箱，长文字可展开。
- 文章、日常与留言板共用评论组件，按目标隔离；支持主楼分页、楼内回复、审核、隐藏整楼与删除占位。后台可按位置/状态筛选、批量审核及博主回复。
- 昵称必填，邮箱和网站选填。邮箱不出现在公开查询结果、不用于第三方头像请求；访客可在当前浏览器记住资料或清除记录。
- 公共页面提供「经典 / 杂志」风格与浅色/暗色/系统偏好；活动热力图按上海日期统计公开文章与日常。

本轮基线标签为 `classic-blog-baseline-20261111`。浏览器连接超时时，桌面/手机视觉验收须在连接恢复后补做；自动化测试不代表实机视觉项目已验收。

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
- 单元测试（`npm test`，内存 SQLite 隔离，覆盖服务端与块编辑器 DOM 交互）覆盖：
  - 参数校验（Zod 规则、批量 ID 数组）、环境变量加载
  - 认证（bcrypt 校验、会话读写、登录限流）
  - 数据查询服务（站点配置、Gallery 公开/后台查询、相册过滤与计数）
  - Gallery 元数据：EXIF 解析映射（真实二进制构造）、图片尺寸探测、元数据隐私过滤、配置解析
  - 水印：预设 / 自定义坐标计算、配置解析与边界钳制、缓存指纹与失效、水印配置 API（40 例）
  - 后台 API：相册 CRUD、照片编辑（标题/描述/发布/移动）、批量发布/隐藏/移动/删除、后台路径管理
  - 后台路径工具：格式/保留字校验、HMAC 入口令牌与重写签名（确定性、不可伪造）
  - 背景预设库、时间格式化
- 设计原则：排版优先（Editorial）、可配置但不默认堆满效果、背景层与前景层完全分离、颜色/间距/字体全部走 Design Token


## 最新入口与编辑体验

- 首页服务新增 Frame、JZ、Pinboard、Video，以及 `/sitemap.xml` 站点地图入口，可在后台「首页服务入口」编辑、排序和开关。
- 已有安装运行 `npm run db:init` 会一次性追加缺少的入口，不覆盖已有名称、排序；后续主动删除的入口不会被重复添加。
- XML Sitemap 保持本站公开页面索引，包含文章、动态、工具和相册；四个独立子域通过首页入口访问。
- 写作默认收起目录、分类辅助列，可从顶部独立打开。块类型、格式状态、键盘斜杠菜单、代码围栏（如 ` ```sh ` 后回车）及紧凑标题快捷输入均支持。
- 手动保存保留光标、撤销记录和请求期间继续输入的内容；标题回车进入正文，手机导航采用遮罩抽屉。


## 2026-11-13 · 工具页、服务介绍与 SEO

工具页采用独立的可搜索目录和紧凑操作卡片，输入区默认 240px、可拖动增高；手机通过选择器切换工具。保留 14 种工具的本地处理、深链接、复制与错误反馈，目录支持键盘导航及无结果状态。

同属 `luen0511.com` 的主域及子域名直接访问，不显示离站确认；其他第三方域名仍显示提醒。判断使用完整主机名边界，`luen0511.com.example.org` 等相似域名不在信任范围内。

| 入口 | 用途 |
| --- | --- |
| [解帧 Frame](https://frame.luen0511.com) | 分享链接解析、图片与视频预览、规格选择与保存 |
| [健康助手](https://jz.luen0511.com) | 个人与家庭的体重、饮水、饮食及运动记录 |
| [Pinboard 协作白板](https://pinboard.luen0511.com) | 便签、图片、画笔与房间实时协作 |
| [映界 CineAtlas](https://video.luen0511.com) | 影视来源聚合检索、收藏、观看进度与播放线路 |
| [Sitemap](https://luen0511.com/sitemap.xml) | 本站公开页面索引 |

介绍根据对应项目源码与 README 核实；公共站点抓取遇到 403 时，不据此推断线上功能全部可用。运行 `npm run db:init` 或生产环境 `node --env-file=.env --import tsx src/db/init.ts`，可幂等补充入口并将域名占位介绍替换为实际用途，保留手工定制介绍和原有排序。

SEO 包含中文首页标题与摘要、分页与分类独立 canonical、文章 Open Graph、默认分享封面、WebSite / WebPage / BlogPosting / BreadcrumbList JSON-LD。JSON-LD 安全转义用户正文和标题；搜索结果与后台不索引。Sitemap 排除隐藏及回收站内容，URL 与页面 canonical 统一，独立子域通过服务入口发现，不混入主域 Sitemap。

SEO 实现参考 [Google 文章结构化数据](https://developers.google.com/search/docs/appearance/structured-data/article)与[分页指导](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)。结构化数据不保证搜索引擎收录或展示增强结果。
