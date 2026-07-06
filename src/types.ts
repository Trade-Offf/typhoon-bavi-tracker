/** 与 worker/normalize.ts 输出保持一致的前端数据类型 */

export type Quad = [number, number, number, number]; // 风圈半径 km：东北|东南|西南|西北

export interface TrackPoint {
  time: string;
  t: number;
  lng: number;
  lat: number;
  strong: string;
  power: number | null;
  speed: number;
  pressure: number;
  moveSpeed: number | null;
  moveDir: string | null;
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
  agency: string;
  points: ForecastPoint[];
}

export interface TyphoonData {
  id: string;
  name: string;
  enName: string;
  active: boolean;
  source: string;
  fetchedAt: string;
  points: TrackPoint[];
  forecasts: AgencyForecast[];
}
