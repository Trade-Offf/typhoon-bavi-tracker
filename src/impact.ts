/**
 * 城市波及倒计时：基于中央气象台预报路径，估算 7 级风圈（大风开始、
 * 应停止户外活动）到达各重点城市的时间。纯函数，输入台风数据输出倒计时。
 */
import type { TyphoonData } from "./types";
import { haversineKm } from "./geo";

export interface City {
  name: string;
  lng: number;
  lat: number;
}

/** 巴威预报路径沿线的重点城市/区域 */
export const CITIES: City[] = [
  { name: "台北", lng: 121.56, lat: 25.03 },
  { name: "高雄", lng: 120.31, lat: 22.63 },
  { name: "宁德", lng: 119.55, lat: 26.67 },
  { name: "福州", lng: 119.3, lat: 26.08 },
  { name: "泉州", lng: 118.58, lat: 24.91 },
  { name: "厦门", lng: 118.09, lat: 24.48 },
  { name: "温州", lng: 120.7, lat: 28.0 },
  { name: "台州", lng: 121.42, lat: 28.66 },
  { name: "宁波", lng: 121.55, lat: 29.87 },
  { name: "杭州", lng: 120.15, lat: 30.29 },
  { name: "上海", lng: 121.47, lat: 31.23 },
];

export type ImpactStatus = "inside" | "incoming" | "watch";

export interface CityImpact extends City {
  status: ImpactStatus;
  /** 7 级风圈预计到达时刻 epoch ms（inside 时为已进入，watch 时无） */
  etaT: number | null;
  /** 预报期内距台风中心最近距离 km */
  minDistKm: number;
  /** 最近距离出现时刻 */
  minDistT: number;
  advice: string;
}

interface Sample {
  t: number;
  lng: number;
  lat: number;
}

/** 由实测末段 + 中国预报路径构造时间线，并按 30 分钟粒度插值采样 */
function buildSamples(data: TyphoonData): Sample[] {
  const nodes: Sample[] = data.points.map((p) => ({ t: p.t, lng: p.lng, lat: p.lat }));
  const fc =
    data.forecasts.find((f) => f.agency === "中国") ?? data.forecasts[0];
  if (fc) {
    const lastT = nodes[nodes.length - 1]?.t ?? 0;
    for (const q of fc.points) {
      if (q.t > lastT) nodes.push({ t: q.t, lng: q.lng, lat: q.lat });
    }
  }
  const samples: Sample[] = [];
  const STEP = 30 * 60 * 1000;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    for (let t = a.t; t < b.t; t += STEP) {
      const f = (t - a.t) / (b.t - a.t);
      samples.push({ t, lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f });
    }
  }
  if (nodes.length) samples.push(nodes[nodes.length - 1]);
  return samples;
}

function adviceFor(status: ImpactStatus, etaT: number | null, now: number): string {
  if (status === "inside") return "大风影响中，请留在室内，远离门窗";
  if (status === "watch") return "预计不直接进入大风圈，仍需关注官方预警";
  const hours = (etaT! - now) / 3600e3;
  if (hours > 48) return "关注台风动态，检查应急物资清单";
  if (hours > 24) return "抓紧完成采买储备：饮水、食物、电源";
  if (hours > 12) return "加固门窗、收阳台杂物，减少不必要外出";
  return "停止户外活动，转移人员按社区通知就位";
}

/** "我的位置"专用名，贯穿列表、地图标记与预警条 */
export const MY_LOCATION = "我的位置";

/**
 * 计算各城市波及倒计时。
 * 风圈半径取最新实测 7 级风圈四象限均值（预报点缺少风圈数据）。
 * cities 可传入含用户实际定位的扩展列表——坐标只在本机参与计算，不上传。
 */
export function computeImpacts(data: TyphoonData, now = Date.now(), cities: City[] = CITIES): CityImpact[] {
  const last = data.points[data.points.length - 1];
  const r7 = last?.r7 ? last.r7.reduce((s, v) => s + v, 0) / 4 : 300;
  const samples = buildSamples(data);

  const impacts = cities.map((city) => {
    let etaT: number | null = null;
    let minDistKm = Infinity;
    let minDistT = now;
    for (const s of samples) {
      const d = haversineKm(city.lng, city.lat, s.lng, s.lat);
      if (d < minDistKm) {
        minDistKm = d;
        minDistT = s.t;
      }
      if (etaT === null && d <= r7) etaT = s.t;
    }
    let status: ImpactStatus;
    if (etaT !== null && etaT <= now) status = "inside";
    else if (etaT !== null) status = "incoming";
    else status = "watch";
    return {
      ...city,
      status,
      etaT,
      minDistKm: Math.round(minDistKm),
      minDistT,
      advice: adviceFor(status, etaT, now),
    };
  });

  // 排序：我的位置永远置顶（这是用户最关心的一行），其余按已波及 → 倒计时 → 最近距离
  return impacts.sort((a, b) => {
    if (a.name === MY_LOCATION) return -1;
    if (b.name === MY_LOCATION) return 1;
    const rank = (x: CityImpact) => (x.status === "inside" ? 0 : x.status === "incoming" ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.etaT !== null && b.etaT !== null) return a.etaT - b.etaT;
    return a.minDistKm - b.minDistKm;
  });
}

/** 48/24 小时警戒线的两个时刻点（均为 7 级风圈到达时刻往前推算） */
export interface WarningMarks {
  t48: number;
  t24: number;
}

export function warningMarks(etaT: number): WarningMarks {
  return { t48: etaT - 48 * 3600e3, t24: etaT - 24 * 3600e3 };
}

/** 倒计时人类可读格式："约 32 小时" / "8 小时 20 分" */
export function formatEta(etaT: number, now = Date.now()): string {
  const ms = etaT - now;
  if (ms <= 0) return "即将波及";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `约 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${String(m).padStart(2, "0")} 分`;
  return `${m} 分钟`;
}
