# Typhoon Bavi Tracker · 巴威台风实时路径追踪

2026 年第 9 号台风「巴威 BAVI」实时路径追踪与多机构预报对比系统。
边缘架构：**Cloudflare Worker（数据代理 + 缓存 + 双源容灾） + MapLibre GL 动效前端**。

> 人类正面对天灾。一个人力量有限，众志成城，总会集结智慧对抗天灾。
> 欢迎提 Issue / PR 共建，转发给需要的人，提前预防，减少灾情影响。

**线上访问：https://chinaupdated.com**

## 快速开始（克隆与部署）

```bash
git clone git@github.com:Trade-Offf/typhoon-bavi-tracker.git
cd typhoon-bavi-tracker
npm install
npm run dev        # 本地开发
npm run deploy     # 构建并发布到 Cloudflare Workers
```

首次推送到 GitHub（维护者）：

```bash
git remote add origin git@github.com:Trade-Offf/typhoon-bavi-tracker.git
git branch -M main
git push -u origin main
```

## 为什么不是 Python + matplotlib？

原始方案（Python 抓取 → matplotlib/cartopy 出静态 PNG → 定时任务轮询）与两个核心目标冲突：

1. **Cloudflare 部署**：Workers/Pages 无法运行 matplotlib/cartopy 栈；
2. **专业动效**：静态 PNG 无法承载路径回放、风圈缩放、台风眼旋转等交互动效。

因此改为 Web 原生架构，Python 侧的「抓取/去重/存储/调度」职责全部被以下机制替代：

| 原 Python 方案 | 现方案 |
|---|---|
| APScheduler 每小时抓取 | 用户请求触发 + 边缘缓存 5 分钟（数据源本身 3 小时一报） |
| CSV/SQLite 存储去重 | 数据源返回全量历史轨迹，无需自建存储 |
| matplotlib 静态图 | MapLibre GL 实时渲染 + 路径回放动画 |
| requests 重试/超时 | Worker 内置超时 + 主备双数据源自动切换 |

## 数据源（已实测验证）

- **主源**：浙江省水利厅台风 API（`typhoon.slt.zj.gov.cn`），单接口聚合
  中央气象台 / 日本气象厅 / JTWC（美国） / 台湾气象署 四家机构的实测与预报；
- **备源**：中央气象台台风网（`typhoon.nmc.cn`）JSONP 接口，主源失效时 Worker 自动切换；
- **资讯**：Google News / Bing News RSS 聚合（数十家媒体，10 分钟边缘缓存）。

两源均在 Worker 内归一化为统一的 `TyphoonData` 结构（`worker/normalize.ts`）。

## 线上地址

- 正式域名：https://chinaupdated.com （及 www.chinaupdated.com）
- 备用地址：https://typhoon-bavi-tracker.surgethisworld.workers.dev

## 功能

### 核心监测
- 强度分级着色路径（国标六级配色）+ 辉光，节点大小映射风速
- 三层实时风圈（7/10/12 级，四象限不等半径，随时间插值形变）
- 台风眼旋转 Marker：转速随强度实时变化
- 路径时间回放：播放/暂停/拖拽/1×2×4× 变速
- 四机构预报路径对比（虚线分色，可逐一开关）
- **中文底图**：高德卫星影像 + 中文注记（国内 CDN，行政边界符合中国标准）

### 城市波及倒计时
基于中央气象台预报路径 + 当前 7 级风圈，估算 **台北 / 高雄 / 福州 / 厦门 / 温州 / 宁波 / 杭州 / 上海** 等 11 个城市的大风到达时间：

- 左侧面板列表 + 地图可点击城市标记
- 顶部红色预警条（影响中 / 即将波及）
- 分级行动建议：>48h 关注 → 24–48h 采买 → 12–24h 加固 → <12h 停止外出
- **分享深链**：`https://chinaupdated.com/?city=温州` 打开即聚焦该城市倒计时

### 信息与传播
- 右侧抽屉：实时资讯 + 台风应对指南（五段式清单 + 紧急电话）
- 一键转发：系统分享 / 复制链接，文案自动带上最近波及城市倒计时
- PWA 支持：可添加到手机主屏幕
- OG 分享卡片 + 正能量口号轮播

> 关于小红书：其内容接口需要登录态与签名，服务端匿名抓取不可行。当前以聚合新闻 + 话题深链替代。

## 性能说明

- MapLibre 独立分包（`manualChunks`），首屏与地图库并行加载
- 台风 API `preload`，资讯面板延迟 2.5s 加载，不阻塞地图
- 页面不可见时暂停动画循环，降低后台 CPU
- **已移除** 国外 CARTO 底图与 MapLibre 字体服务，消除控制台报错

## 本地开发

```bash
npm install
npm run dev        # vite 开发服务器（/api 代理直连数据源）
npm run preview    # 构建后用 wrangler 本地模拟完整 Worker 环境
npm run typecheck  # TypeScript 类型检查
```

## 部署

```bash
npx wrangler login # 首次需要 OAuth 授权
npm run deploy     # 构建 + 发布到 Cloudflare Workers
```

自定义域名在 `wrangler.jsonc` 的 `routes` 中配置。

## 追踪其他台风

修改 `src/app.ts` 中的 `TYPHOON_ID`（格式 `YYYYNN`，如 `202610`），重新部署即可。

## 目录结构

```
├── worker/
│   ├── index.ts       # Worker 入口：路由、边缘缓存、双源容灾
│   ├── normalize.ts   # 台风数据归一化
│   └── news.ts        # 资讯 RSS 聚合
├── src/
│   ├── app.ts         # 前端入口：回放、HUD、分享、倒计时
│   ├── map.ts         # MapLibre 图层（高德底图）
│   ├── impact.ts      # 城市波及倒计时算法
│   ├── geo.ts         # 球面几何
│   ├── guide.ts       # 应对指南
│   └── ...
├── public/
│   ├── og.svg         # 社交分享图
│   └── manifest.webmanifest
├── wrangler.jsonc
└── vite.config.ts
```

## 参与共建

```bash
git clone git@github.com:Trade-Offf/typhoon-bavi-tracker.git
cd typhoon-bavi-tracker
npm install && npm run dev
```

1. Fork 本仓库，创建特性分支：`git checkout -b feat/your-feature`
2. 提交更改并推送到你的 Fork
3. 发起 Pull Request

Roadmap：

- [ ] 城市列表可配置 / 按用户定位自动排序
- [ ] 10 级、12 级风圈到达时间分级倒计时
- [ ] 多台风切换
- [ ] i18n（繁体/英文）
- [ ] 接入更多民间实时信息源

## 免责声明

本站数据来自公开气象服务接口，倒计时为算法估算，**一切防灾决策请以
中央气象台与当地政府发布的官方预警为准**。
