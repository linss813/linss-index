# TODO 待办计划

> 版本：v0.1.0
> 日期：2026-09-03
> 说明：本文件记录待实施的功能与优化计划，完成后将条目移入 [开发记录.md](./开发记录.md)。

***

## 一、移动端适配（响应式） ✅ 已完成 (2026-09-03)

> 已实施于 v2.7.0，详见 [开发记录.md](./开发记录.md)。

### 现状盘点（2026-09-03）

已有 `@media` 响应式覆盖的文件：

| 区域   | 文件                                                                                                                                     | 现状                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 前台布局 | `DesignTokens.astro` / `Header.astro` / `Footer.astro` / `Hero.astro` / `QuickLinks.astro` / `ServiceGroup.astro` / `ServiceRow.astro` | 已有断点，需真机回归          |
| 前台相册 | `GalleryGrid.astro`（2 处）/ `GalleryInfoPanel.astro`（2 处，含 ≤640px 底部抽屉、≤400px 单列）/ `GalleryViewer.astro`（1 处）                            | 部分覆盖                |
| 后台布局 | `AdminLayout.astro`（1 处）                                                                                                               | 侧边栏窄屏行为待完善          |
| 后台页面 | `admin/wallpapers.astro`（1 处，缩略图 640px 适配）                                                                                             | **其余后台管理页基本无移动端适配** |

### 待办项

#### 1. 后台框架（AdminLayout）

- [x] 窄屏（≤768px）侧边栏改为**抽屉式**：默认收起，汉堡按钮呼出，遮罩点击关闭（原有基础上补齐 safe-area、阴影、宽度）

- [x] 顶栏在窄屏显示菜单按钮与当前页面标题；侧边栏菜单项与汉堡按钮触控目标 ≥44px

- [x] 内容区 padding 随屏宽收敛（桌面 24px → 移动端 12px）

- [x] 弹窗（modal）在窄屏近全宽、收窄内边距、限高避让底部安全区，按钮堆叠排列

#### 2. 后台管理页（表格为主）

- [x] 统一 `.data-table` 移动端策略：内容区/面板作为横向滚动容器（`overflow-x:auto` + 惯性滚动），表格设 `min-width` 保留完整列与对齐

- [x] `admin/gallery.astro`：照片列表采用面板内横向滚动（`min-width:780px`），页头/筛选/行内表单项窄屏换行不溢出（替代隐藏列，保留全部功能）

- [x] `admin/settings.astro` / `admin/seo.astro`：表单项输入框本就全宽（`.form-row input{width:100%}`），主题色板预览 `.palette-preview` 窄屏单列

- [x] `admin/services.astro` / `admin/projects.astro` / `admin/navigation.astro` / `admin/theme.astro` / `admin/admins.astro` / `admin/system.astro`：批量操作按钮触控热区加大、`form-actions` 换行，统一由 AdminLayout 全局规则覆盖

- [x] 壁纸页裁剪弹窗（Canvas 裁剪器）：比例按钮触控加大、画布 `max-width:100%` + `touch-action:none`（触摸拖拽已可用）

#### 3. 前台回归与补强

- [x] Gallery 瀑布流列数断点：≥1024px 三列 / 640–1024px 两列 / <640px 单列（`GalleryGrid.astro`）；前台容器 `.container` 移动端 padding 收敛为 16px

- [x] Lightbox：左右切换按钮在移动端移至屏幕边缘并加大到 44px，顶部工具按钮同步 44px；双指缩放/单指平移手势（既有）保留

- [x] InfoPanel 底部抽屉（≤640px）打开时左右切换按钮自动抬高避让（既有规则保留）

- [x] `<head>` viewport meta 确认正确（`width=device-width, initial-scale=1`，前台 Layout 与后台 AdminLayout 均有）

#### 4. 验收标准

- [x] 无横向滚动条、无内容溢出：桌面视口（1190px）走查 `/` 与 `/gallery` 均无溢出；移动端断点经构建产物 CSS 静态核对（后台自动化浏览器暂不支持 CDP 视口仿真，**建议真机/DevTools 设备模式补一次 375/393/768px 走查**）

- [x] 主要可点击元素触控目标 ≥44×44px（汉堡键、菜单项、Lightbox 按钮、相册 chip、裁剪比例按钮、行内操作按钮）

- [x] 弹窗、Toast、抽屉、顶栏/侧边栏均接入 `env(safe-area-inset-*)`

- [x] 桌面端（≥1200px）视觉与交互无回归：`astro check` 0 errors、201/201 单测通过、构建成功

***

## 二、Gallery 缩略图优先加载 + 查看原图按钮 ✅ 已完成 (2026-09-03)

> 已实施于 v2.5.0，详见 [开发记录.md](./开发记录.md#v250)。

### 现状（实施前）

- 列表页（`GalleryItem.astro`）已使用缩略图 + `loading="lazy"`

- Lightbox（`GalleryViewer.astro`）打开时**直接加载原图**（`mainImage.src = p.image`），移动端/弱网下大图加载慢、白屏等待

- 缩略图条已使用 `thumbnail` 字段，但主图区未利用缩略图做占位

### 待办项（已全部完成）

- [x] **缩略图先行**：Lightbox 打开时主图区先显示当前照片的 `thumbnail`（CSS 模糊放大占位），原图异步加载完成（`onload`）后淡入替换；加载失败显示错误态与重试

- [x] **左右切换同理**：切换照片先显示缩略图占位再加载原图；预加载策略调整为「预加载相邻原图」保留，但当前图始终先呈现缩略图

- [x] **「查看原图」按钮**：Lightbox 工具栏新增按钮：
  - 新标签页打开原图（`<a target="_blank" rel="noopener">`，右键可另存）

  - 提供「下载原图」（`download` 属性）

  - 按钮在原图未加载完成时置灰，加载完成后可用

- [x] 图片切换时重置缩放/平移状态不与占位逻辑冲突

- [x] 无独立缩略图字段（thumbnail 与 image 相同）时占位逻辑自然降级，不闪烁

### 验收标准（已通过）

- [x] 弱网节流（DevTools Slow 3G）下打开 Lightbox：立即看到模糊缩略图，无白屏

- [x] 原图加载完成后平滑替换（淡入过渡），加载失败有明确错误提示

- [x] 「查看原图」按钮在新标签打开完整分辨率图片

- [x] 桌面端与移动端交互一致

***

## 三、完成后收尾（每次实施完毕）

- [ ] `npx astro check` 0 errors

- [ ] `npx vitest run` 全部通过

- [ ] `npm run build` 成功并重启 `node dist/server/entry.mjs`

- [ ] 变更摘要写入 [开发记录.md](./开发记录.md)（版本号、日期、根因/方案/验证）

- [ ] 提交并推送 Gitee

