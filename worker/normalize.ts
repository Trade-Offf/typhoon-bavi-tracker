/**
 * 数据归一化层：把不同数据源（浙江省水利厅台风 API / 中央气象台 NMC JSONP）
 * 统一成前端消费的 TyphoonData 结构。纯函数，便于单元测试。
 */

export type Quad = [number, number, number, number]; // 风圈半径 km，统一为：东北|东南|西南|西北

export interface TrackPoint {
  time: string; // "2026-07-06 23:00" (UTC+8)
  t: number; // epoch ms
  lng: number;
  lat: number;
  strong: string; // 强度中文，如 "超强台风"
  power: number | null; // 风力等级
  speed: number; // 中心最大风速 m/s
  pressure: number; // 中心气压 hPa
  moveSpeed: number | null; // 移动速度 km/h
  moveDir: string | null; // 移动方向中文
  r7: Quad | null;
  r10: Quad | null;
  r12: Quad | null;
}

export interface ForecastPoint {
  time: string;
  t: number;
  lng: number;
  lat: number;
  strong: string;
  speed: number | null;
  pressure: number | null;
}

export interface AgencyForecast {
  agency: string; // 中国 / 日本 / 美国 / 中国台湾
  points: ForecastPoint[];
}

export interface TyphoonData {
  id: string;
  name: string;
  enName: string;
  active: boolean;
  source: string;
  fetchedAt: string; // ISO
  points: TrackPoint[];
  forecasts: AgencyForecast[]; // 基于最新实测点的各机构预报
}

const NMC_STRONG: Record<string, string> = {
  TD: "热带低压",
  TS: "热带风暴",
  STS: "强热带风暴",
  TY: "台风",
  STY: "强台风",
  SuperTY: "超强台风",
};

const NMC_DIR: Record<string, string> = {
  N: "北", NNE: "北北东", NE: "东北", ENE: "东北东",
  E: "东", ESE: "东南东", SE: "东南", SSE: "南南东",
  S: "南", SSW: "南南西", SW: "西南", WSW: "西南西",
  W: "西", WNW: "西北西", NW: "西北", NNW: "北北西",
};

/** "2026-07-06 23:00:00" (北京时间) -> epoch ms */
function parseCst(s: string): number {
  return Date.parse(s.replace(" ", "T") + "+08:00");
}

/** "202607062300" (北京时间) -> epoch ms 与显示串 */
function parseNmcTime(s: string): { t: number; time: string } {
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+08:00`;
  return { t: Date.parse(iso), time: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}` };
}

function fmt(t: number): string {
  // 输出北京时间 "YYYY-MM-DD HH:mm"
  const d = new Date(t + 8 * 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 浙江源风圈顺序为 东北|东南|西北|西南，统一转成 东北|东南|西南|西北 */
function parseQuadZj(s: string | undefined | null): Quad | null {
  if (!s) return null;
  const p = s.split("|").map(Number);
  if (p.length !== 4 || p.some((n) => !isFinite(n) || n <= 0)) return null;
  return [p[0], p[1], p[3], p[2]];
}

/** 由风速(m/s)推算风力等级（蒲福扩展） */
export function speedToPower(speed: number): number {
  const table: Array<[number, number]> = [
    [8.0, 5], [10.8, 6], [13.9, 7], [17.2, 8], [20.8, 9], [24.5, 10],
    [28.5, 11], [32.7, 12], [37.0, 13], [41.5, 14], [46.2, 15], [51.0, 16], [56.1, 17],
  ];
  let power = 5;
  for (const [th, p] of table) if (speed >= th) power = p;
  // 我国风力等级国标最高 17 级，超出只能称「17 级以上」，绝不产出 18 这种不存在的等级
  return power;
}

/** 浙江省水利厅台风 API -> TyphoonData */
export function normalizeZj(raw: any): TyphoonData {
  const points: TrackPoint[] = (raw.points ?? []).map((p: any) => ({
    time: fmt(parseCst(p.time)),
    t: parseCst(p.time),
    lng: Number(p.lng),
    lat: Number(p.lat),
    strong: p.strong || "",
    power: p.power ? Number(p.power) : null,
    speed: Number(p.speed),
    pressure: Number(p.pressure),
    moveSpeed: p.movespeed ? Number(p.movespeed) : null,
    moveDir: p.movedirection || null,
    r7: parseQuadZj(p.radius7),
    r10: parseQuadZj(p.radius10),
    r12: parseQuadZj(p.radius12),
  }));

  // 取最后一个带预报的实测点作为当前预报
  let forecasts: AgencyForecast[] = [];
  for (let i = (raw.points ?? []).length - 1; i >= 0; i--) {
    const fc = raw.points[i]?.forecast;
    if (fc && fc.length) {
      forecasts = fc.map((f: any) => ({
        agency: f.tm,
        points: (f.forecastpoints ?? []).map((q: any) => ({
          time: fmt(parseCst(q.time)),
          t: parseCst(q.time),
          lng: Number(q.lng),
          lat: Number(q.lat),
          strong: q.strong || "",
          speed: Number(q.speed) > 0 ? Number(q.speed) : null,
          pressure: Number(q.pressure) > 0 ? Number(q.pressure) : null,
        })),
      }));
      break;
    }
  }

  return {
    id: String(raw.tfid),
    name: raw.name,
    enName: raw.enname,
    active: raw.isactive === "1",
    source: "浙江省水利厅（聚合中央气象台/日本气象厅/JTWC/台湾气象署）",
    fetchedAt: new Date().toISOString(),
    points,
    forecasts,
  };
}

/** 中央气象台 NMC JSONP 文本 -> TyphoonData（备用数据源，仅含 BABJ 预报） */
export function normalizeNmc(jsonpText: string): TyphoonData {
  const m = jsonpText.match(/^[\w$]+\((.*)\)\s*;?\s*$/s);
  if (!m) throw new Error("NMC JSONP 格式无法解析");
  const raw = JSON.parse(m[1]);
  const ty = raw.typhoon;
  const rawPoints: any[] = ty[8] ?? [];

  const points: TrackPoint[] = rawPoints.map((p) => {
    const { t, time } = parseNmcTime(p[1]);
    const radii: Record<string, Quad> = {};
    for (const r of p[10] ?? []) {
      // NMC 顺序：东北、东南、西南、西北
      radii[r[0]] = [r[1], r[2], r[3], r[4]] as Quad;
    }
    return {
      time,
      t,
      lng: Number(p[4]),
      lat: Number(p[5]),
      strong: NMC_STRONG[p[3]] ?? p[3],
      power: speedToPower(Number(p[7])),
      speed: Number(p[7]),
      pressure: Number(p[6]),
      moveSpeed: p[9] != null ? Number(p[9]) : null,
      moveDir: NMC_DIR[p[8]] ?? p[8] ?? null,
      r7: radii["30KTS"] ?? null,
      r10: radii["50KTS"] ?? null,
      r12: radii["64KTS"] ?? null,
    };
  });

  let forecasts: AgencyForecast[] = [];
  for (let i = rawPoints.length - 1; i >= 0; i--) {
    const fc = rawPoints[i]?.[11];
    if (fc && Object.keys(fc).length) {
      forecasts = Object.entries(fc).map(([code, arr]) => ({
        agency: code === "BABJ" ? "中国" : code,
        points: (arr as any[]).map((q) => {
          const base = parseNmcTime(q[1]);
          const t = base.t + Number(q[0]) * 3600e3;
          return {
            time: fmt(t),
            t,
            lng: Number(q[2]),
            lat: Number(q[3]),
            strong: NMC_STRONG[q[7]] ?? q[7] ?? "",
            speed: q[5] != null ? Number(q[5]) : null,
            pressure: q[4] != null ? Number(q[4]) : null,
          };
        }),
      }));
      break;
    }
  }

  return {
    id: String(ty[3]),
    name: ty[2],
    enName: ty[1],
    active: ty[7] === "start",
    source: "中央气象台 typhoon.nmc.cn（备用源）",
    fetchedAt: new Date().toISOString(),
    points,
    forecasts,
  };
}
