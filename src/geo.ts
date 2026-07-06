import type { Quad, TrackPoint } from "./types";

const R = 6371; // 地球半径 km
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** 两点球面距离（km） */
export function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dφ = (lat2 - lat1) * D2R;
  const dλ = (lng2 - lng1) * D2R;
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 从 (lng,lat) 沿方位角 bearing（度，正北为 0）走 dist 公里后的坐标 */
export function destination(lng: number, lat: number, bearing: number, dist: number): [number, number] {
  const δ = dist / R;
  const θ = bearing * D2R;
  const φ1 = lat * D2R;
  const λ1 = lng * D2R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [λ2 * R2D, φ2 * R2D];
}

/**
 * 四象限不等半径风圈多边形（GeoJSON ring）。
 * quad 顺序：东北(0°-90°) | 东南(90°-180°) | 西南(180°-270°) | 西北(270°-360°)
 */
export function windCircleRing(lng: number, lat: number, quad: Quad): [number, number][] {
  const ring: [number, number][] = [];
  for (let b = 0; b <= 360; b += 4) {
    const idx = Math.floor((b % 360) / 90);
    ring.push(destination(lng, lat, b, quad[idx]));
  }
  ring.push(ring[0]);
  return ring;
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function lerpQuad(a: Quad | null, b: Quad | null, f: number): Quad | null {
  if (a && b) return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f)];
  return f < 0.5 ? a : b;
}

export interface TrackState {
  lng: number;
  lat: number;
  speed: number;
  pressure: number;
  strong: string;
  power: number | null;
  moveSpeed: number | null;
  moveDir: string | null;
  r7: Quad | null;
  r10: Quad | null;
  r12: Quad | null;
  time: string;
  index: number; // 所处区间左端点下标
  frac: number;
}

/** 在轨迹上按时间 t 插值出台风状态（t 超界时钳到端点） */
export function stateAtTime(points: TrackPoint[], t: number): TrackState {
  const first = points[0];
  const last = points[points.length - 1];
  if (t <= first.t) return { ...pick(first), index: 0, frac: 0 };
  if (t >= last.t) return { ...pick(last), index: points.length - 1, frac: 0 };

  let i = 0;
  while (i < points.length - 2 && points[i + 1].t <= t) i++;
  const a = points[i];
  const b = points[i + 1];
  const f = (t - a.t) / (b.t - a.t);
  const disc = f < 0.5 ? a : b;
  return {
    lng: lerp(a.lng, b.lng, f),
    lat: lerp(a.lat, b.lat, f),
    speed: lerp(a.speed, b.speed, f),
    pressure: lerp(a.pressure, b.pressure, f),
    strong: disc.strong,
    power: disc.power,
    moveSpeed: disc.moveSpeed,
    moveDir: disc.moveDir,
    r7: lerpQuad(a.r7, b.r7, f),
    r10: lerpQuad(a.r10, b.r10, f),
    r12: lerpQuad(a.r12, b.r12, f),
    time: disc.time,
    index: i,
    frac: f,
  };
}

function pick(p: TrackPoint) {
  const { lng, lat, speed, pressure, strong, power, moveSpeed, moveDir, r7, r10, r12, time } = p;
  return { lng, lat, speed, pressure, strong, power, moveSpeed, moveDir, r7, r10, r12, time };
}
