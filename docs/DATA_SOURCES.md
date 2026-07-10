# 数据源与接口字段清单

> **说明**：浙江省水利厅台风系统（`typhoon.slt.zj.gov.cn`）**没有公开的 API 文档**。本文档由官网 SPA 前端打包 JS（`baseURL: "/Api"`）与 Network 抓包**逆向整理**，字段含义以实际返回为准，**随时可能变更**。
>
> 整理时间：2026-07-07 · 样本台风：`202609`（巴威）

---

## 0. 合规说明（务必先读）

本项目**只聚合与展示官方已公开的气象信息**，不是气象预报/预警的发布主体：

- 所有台风路径、强度、风圈数据均来自下列**官方公开渠道**，页面与分享物料一律标注**来源 + 时间**。
- 站内城市「影响时间」为基于官方预报路径的**数学几何估算**，标注「估算 · 非官方预警」，不构成预报或预警。
- 依据《气象法》《气象灾害防御条例》的**统一发布制度**，本站不制作、不发布任何气象预报与灾害预警。
- 「官方发布」区（`public/official.json`）仅转载**已获授权**的官方公众号推文，跳转原文、不改写，内容以原文为准。

一切以官方发布为准。

---

## 1. 总览

| 层级 | 地址 | 角色 |
|------|------|------|
| 上游主源 | `https://typhoon.slt.zj.gov.cn/Api/*` | 浙江水利厅聚合接口（中/日/美/台/港等多机构预报） |
| 上游备源 | `http://typhoon.nmc.cn/weatherservice/typhoon/jsons/*` | 中央气象台 JSONP，主源失败时 Worker 自动切换 |
| 本项目边缘 | `GET /api/typhoon/:tfid` | Cloudflare Worker 归一化 + 5 分钟边缘缓存 |
| 本地开发 | Vite 代理 `/api/typhoon` → `/Api/TyphoonInfo` | 见 `vite.config.ts` |

**台风编号 `tfid` 格式**：通常为 6 位 `YYYYNN`（如 `202609` = 2026 年第 9 号）。个别低压系统会出现 8 位（如 `20260007`），以 `TyphoonList` 返回为准。

**请求头**：Worker 发送 `Referer: https://typhoon.slt.zj.gov.cn/wap.html`（历史习惯；实测不带 Referer 也可 200）。响应头含 `Access-Control-Allow-Origin: *`。

---

## 2. 浙江水利厅 `/Api` 路由清单

从 `js/app~42f9d7e6.06ad9856.js` 提取：

| 方法 | 路径 | 用途 | 本项目 |
|------|------|------|--------|
| GET | `/TyphoonList/{year}` | 某年全部台风摘要列表 | 未用（可用来发现 `tfid`） |
| GET | `/TyphoonInfo/{tfid}` | 单台风完整轨迹 + 多机构预报 | **主源** |
| GET | `/TyphoonSearch/{keyword}` | 按名称搜索历史台风 | 未用 |
| GET | `/TyhoonActivity` | 当前活跃台风快照（注意拼写 Tyhoon） | 未用 |
| GET | `/TyphoonEvent/{id}` | 台风事件（参数规则不明，部分 id 404） | 未用 |
| GET | `/LastRadar` | 最新雷达拼图元数据 | 未用 |
| GET | `/LastWind` | 最新风场元数据 | 未用 |
| GET | `/LastWind/{id}` | 指定风场 | 未用 |
| GET | `/LeastRain/{hours}` | 近期降雨等值面（默认 24） | 未用 |
| GET | `/LeastCloud/?type={hours}` | 近期云图（默认 24） | 未用 |

### curl 示例

```bash
# 2026 年台风列表
curl -s "https://typhoon.slt.zj.gov.cn/Api/TyphoonList/2026"

# 巴威详情（本项目主接口）
curl -s "https://typhoon.slt.zj.gov.cn/Api/TyphoonInfo/202609"

# 当前活跃台风
curl -s "https://typhoon.slt.zj.gov.cn/Api/TyhoonActivity"

# 按名搜索
curl -s "https://typhoon.slt.zj.gov.cn/Api/TyphoonSearch/巴威"
```

---

## 3. `GET /Api/TyphoonList/{year}`

返回：**JSON 数组**，每个元素为一届台风摘要。

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `tfid` | string | `"202609"` | 台风编号，传给 `TyphoonInfo` |
| `name` | string | `"巴威"` | 中文名 |
| `enname` | string | `"BAVI"` | 英文名 |
| `starttime` | string | `"2026-07-02 08:00:00"` | 开始时间（北京时间，`YYYY-MM-DD HH:mm:ss`） |
| `endtime` | string | `"2026-07-07 14:00:00"` | 结束/停编时间；活跃中可能为预估 |
| `warnlevel` | string | `""` / `"white"` | 预警等级标识，常见为空或 `white` |
| `isactive` | string | `"1"` / `"0"` | 是否活跃：`"1"` = 活跃 |

---

## 4. `GET /Api/TyphoonInfo/{tfid}`（核心）

返回：**JSON 对象**，含全历史轨迹点；**最新若干点**内嵌多机构预报。

### 4.1 顶层字段

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `tfid` | string | `"202609"` | 台风编号 |
| `name` | string | `"巴威"` | 中文名 |
| `enname` | string | `"BAVI"` | 英文名 |
| `isactive` | string | `"1"` | 是否活跃 |
| `starttime` | string | `"2026-07-02 08:00:00"` | 生命史开始（北京时间） |
| `endtime` | string | `"2026-07-07 14:00:00"` | 生命史结束/停编 |
| `warnlevel` | string | `"white"` | 预警等级 |
| `centerlng` | string | `"149.250000"` | 当前中心经度（字符串浮点） |
| `centerlat` | string | `"18.750000"` | 当前中心纬度 |
| `land` | array | 见下表 | 登陆记录；无登陆时为 `[]` |
| `points` | array | 见下表 | 实况轨迹点，按时间升序 |

### 4.2 `land[]` 登陆记录

样本来源：`TyphoonInfo/202311`（海葵）

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `landaddress` | string | `"广东省饶平县沿海"` | 登陆地点描述 |
| `landtime` | string | `"2023-09-05 05:20:00"` | 登陆时间（北京时间） |
| `lng` | string | `"117.15"` | 登陆点经度 |
| `lat` | string | `"23.60"` | 登陆点纬度 |
| `info` | string | `"台风"海葵"已于…"` | 登陆文字说明，可能含 `\r\n` |
| `strong` | string | `"热带风暴"` | 登陆时强度 |

### 4.3 `points[]` 实况轨迹点

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `time` | string | `"2026-07-07 08:00:00"` | 观测时间（**北京时间**，`YYYY-MM-DD HH:mm:ss`） |
| `lng` | string | `"139.10"` | 中心经度 |
| `lat` | string | `"16.20"` | 中心纬度 |
| `strong` | string | `"超强台风"` | 强度中文等级 |
| `power` | string | `"16"` | 风力等级（蒲福，字符串数字） |
| `speed` | string | `"55"` | 中心最大风速 **m/s** |
| `pressure` | string | `"930"` | 中心气压 **hPa** |
| `movespeed` | string | `"25"` | 移动速度 **km/h**（小写 s，注意拼写） |
| `movedirection` | string | `"西北西"` | 移动方向中文 |
| `radius7` | string | `"280\|180\|220\|180"` | 7 级风圈半径 km，四象限 `\|` 分隔 |
| `radius10` | string | `"160\|120\|140\|120"` 或 `""` | 10 级风圈；无则空串 |
| `radius12` | string | 同上 | 12 级风圈；无则空串 |
| `forecast` | array | 见 4.4 | 该时次各机构预报；早期点可能无 |
| `ckposition` | string | `"距离台湾基隆市东偏南方向约1980公里"` | 参考位置描述（文案） |
| `jl` | string | `"巴威"将以每小时25公里…"` | 移动趋势描述（文案） |

#### 风圈 `radius*` 象限顺序（重要）

浙江源顺序：**东北 | 东南 | 西北 | 西南**

本项目 `normalize.ts` 统一为：**东北 | 东南 | 西南 | 西北**（与 NMC 一致），转换方式：`[p0, p1, p3, p2]`。

### 4.4 `points[].forecast[]` 机构预报

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `tm` | string | `"中国"` / `"日本"` / `"美国"` / `"中国台湾"` / `"中国香港"` | 预报机构标识 |
| `forecastpoints` | array | 见下表 | 该机构预报路径点 |

#### `forecastpoints[]`

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `time` | string | `"2026-07-08 08:00:00"` | 预报到达时间（北京时间） |
| `lng` | string | `"135.00"` | 预报经度 |
| `lat` | string | `"17.50"` | 预报纬度 |
| `strong` | string | `"超强台风"` | 预报强度 |
| `power` | string | `"16"` | 预报风力等级 |
| `speed` | string | `"55"` | 预报风速 m/s；`"0"` 表示缺测 |
| `pressure` | string | `"930"` | 预报气压 hPa；`"0"` 表示缺测 |
| `tm` | string | `"中国"` | （可选）机构重复字段，出现在部分点 |
| `ybsj` | string | `"2026-07-07T06:00:00.000+00:00"` | （可选）预报发布时间（ISO UTC） |

#### 机构 `tm` 与真实数据源对应关系（推断）

| `tm` 值 | 通常对应 |
|---------|----------|
| 中国 | 中央气象台（BABJ） |
| 日本 | 日本气象厅（JMA） |
| 美国 | JTWC |
| 中国台湾 | 台湾气象署（CWA） |
| 中国香港 | 香港天文台 |

> 浙江水利厅是**聚合展示层**，原始报文来自各气象机构；本项目只消费其 JSON，不直连各机构 API。

### 4.5 预报选取规则（本项目）

`worker/normalize.ts` 从 **`points` 数组末尾向前** 找第一个带非空 `forecast` 的实况点，将其 `forecast[]` 映射为前端 `TyphoonData.forecasts`。更早时次的预报会被丢弃。

---

## 5. `GET /Api/TyhoonActivity`

返回：**JSON 数组**，当前活跃台风的**最新实况快照**（非完整轨迹）。

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `tfid` | string | `"202609"` | 台风编号 |
| `name` | string | `"巴威"` | 中文名 |
| `enname` | string | `"BAVI"` | 英文名 |
| `time` | string | `"2026-07-07T06:00:00.000+00:00"` | 观测时间（ISO UTC） |
| `timeformate` | string | `"7月7日14时"` | 展示用中文时间 |
| `lng` / `lat` | string | `"138.40"` / `"16.50"` | 中心坐标 |
| `strong` | string | `"超强台风"` | 强度 |
| `power` | string | `"16"` | 风力等级 |
| `speed` | string | `"55"` | 风速 m/s |
| `pressure` | string | `"930"` | 气压 hPa |
| `movespeed` | string | `"25"` | 移速 km/h |
| `movedirection` | string | `"西"` | 移向 |
| `radius7` | string | `"380"` | 7 级风圈（此处为**单值**，非四象限） |
| `radius10` | string | `"160"` | 10 级风圈单值 |
| `warnlevel` | null \| string | `null` | 预警等级 |

---

## 6. `GET /Api/TyphoonSearch/{keyword}`

返回：**JSON 数组**，历史台风搜索命中。

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `name` | string | `"202008巴威"` | 展示名（年号+序号+名称） |
| `value` | string | `"202008"` | 可传给 `TyphoonInfo` 的 id |
| `starttime` | string | `"2020-08-21 20:00:00"` | 开始时间 |
| `endtime` | string | `"2020-08-27 17:00:00"` | 结束时间 |

---

## 7. 辅助图层接口（本项目未用）

### `GET /Api/LastRadar`

| 字段 | 说明 |
|------|------|
| `synTime` | 拼图合成时间 |
| `radarType` | 雷达类型 |
| `radar0_0`, `radar1_0`, `radar0_1`, `radar1_1` | 雷达图块 URL 或路径 |

### `GET /Api/LastWind` / `/LastWind/{id}`

| 字段 | 说明 |
|------|------|
| `synTime` | 风场时间 |
| `sourceName` | 数据来源名 |
| `fileName` | 风场文件 |
| `windData` | 风场数据（结构未展开） |

### `GET /Api/LeastRain/{hours}`

| 字段 | 说明 |
|------|------|
| `time` | 数据时间 |
| `forecast_time` | 预报基准时间 |
| `contours` | 降雨等值面 GeoJSON 或类似结构 |

### `GET /Api/LeastCloud/?type={hours}`

结构类似降雨接口，返回云图相关 contours（未完整展开）。

---

## 8. 本项目归一化输出 `TyphoonData`

Worker 将浙江源（或 NMC 备源）统一为下列结构，前端 `src/types.ts` 与之对齐。

### 8.1 顶层

| 字段 | 类型 | 浙江源映射 |
|------|------|------------|
| `id` | string | `tfid` |
| `name` | string | `name` |
| `enName` | string | `enname` |
| `active` | boolean | `isactive === "1"` |
| `source` | string | 固定说明字符串 |
| `fetchedAt` | string | Worker 抓取时刻 ISO |
| `points` | TrackPoint[] | `points[]` 映射 |
| `forecasts` | AgencyForecast[] | 最新带预报实况点的 `forecast[]` |

### 8.2 `TrackPoint`（实况点）

| 字段 | 浙江源字段 | 备注 |
|------|------------|------|
| `time` | `time` | 格式化为 `YYYY-MM-DD HH:mm`（UTC+8） |
| `t` | `time` | epoch ms |
| `lng`, `lat` | `lng`, `lat` | `Number()` |
| `strong` | `strong` | |
| `power` | `power` | 空则 `null` |
| `speed` | `speed` | m/s |
| `pressure` | `pressure` | hPa |
| `moveSpeed` | `movespeed` | 空则 `null` |
| `moveDir` | `movedirection` | |
| `r7`, `r10`, `r12` | `radius7/10/12` | 四象限顺序已修正 |

**未映射的浙江字段**：`ckposition`、`jl`、`land`（顶层）、预报点上的 `tm`/`ybsj`。

### 8.3 `AgencyForecast` / `ForecastPoint`

| 字段 | 浙江源 |
|------|--------|
| `agency` | `forecast[].tm` |
| `points[].time/t/lng/lat/strong` | `forecastpoints[]` 同名字段 |
| `points[].speed/pressure` | 值为 `0` 或空时置 `null` |

---

## 9. 备源：中央气象台 NMC JSONP

主源失败时 Worker 调用（见 `worker/index.ts`）：

```bash
# 1. 按年取列表（JSONP）
curl -s "http://typhoon.nmc.cn/weatherservice/typhoon/jsons/list_2026" \
  -H "Referer: http://typhoon.nmc.cn/web.html"

# 2. 用 list 返回的内部 id（entry[0]）取详情
curl -s "http://typhoon.nmc.cn/weatherservice/typhoon/jsons/view_{id}" \
  -H "Referer: http://typhoon.nmc.cn/web.html"
```

NMC 返回 **JSONP**（`callback({...})`），数组下标结构，由 `normalizeNmc()` 解析。备源**仅含中国（BABJ）预报**，无日/美/台多机构路径。

| NMC 概念 | 说明 |
|----------|------|
| 台风 list 项 `[3]` | 短编号，如 `2609` ↔ `202609` |
| 轨迹 `typhoon[8]` | 实况点数组 |
| 点 `[10]` | 风圈：30KTS/50KTS/64KTS → r7/r10/r12 |
| 点 `[11]` | 预报 dict，键 `BABJ` = 中国 |

---

## 10. 缓存与容灾（本项目行为）

| 环节 | 策略 |
|------|------|
| 边缘缓存 | `Cache API`，键 `/api/typhoon/{tfid}`，TTL **300s** |
| 主源超时 | **10s** abort |
| 主源失败 | 自动切 NMC 备源 |
| 双源均失败 | HTTP **502**，body 含 `primary` / `fallback` 错误信息 |

---

## 11. 使用注意

1. **非官方开放 API**：无 SLA，字段、路径、鉴权策略均可能变更。
2. **请合理访问**：本项目 5 分钟边缘缓存；勿高频直连上游。
3. **数值类型**：上游大量数值以 **string** 返回，归一化层需 `Number()`。
4. **时间口径**：`TyphoonInfo` 轨迹时间为**北京时间**；`TyhoonActivity.time` 为 **ISO UTC**，混用时需转换。
5. **合规表述**：对外说明数据来源为「浙江水利厅聚合接口 / 中央气象台备源」，本工具为个人公益展示，**非政府发布**。

---

## 12. 相关代码

| 文件 | 职责 |
|------|------|
| `worker/index.ts` | 抓取、缓存、双源容灾 |
| `worker/normalize.ts` | 浙江 / NMC → `TyphoonData` |
| `vite.config.ts` | 本地 dev 代理 |
| `src/types.ts` | 前端类型定义 |
| `src/app.ts` | `TYPHOON_ID = "202609"`，请求 `/api/typhoon/...` |
