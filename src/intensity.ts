/** 台风强度等级 → 视觉映射（参照国标 GB/T 19201 分级） */

export interface IntensityStyle {
  color: string;
  rank: number;
}

const LEVELS: Record<string, IntensityStyle> = {
  热带低压: { color: "#43d9a3", rank: 0 },
  热带风暴: { color: "#4aa8ff", rank: 1 },
  强热带风暴: { color: "#ffd23f", rank: 2 },
  台风: { color: "#ff9636", rank: 3 },
  强台风: { color: "#ff5f8f", rank: 4 },
  超强台风: { color: "#ff3131", rank: 5 },
};

export const INTENSITY_ORDER = Object.keys(LEVELS);

export function intensityOf(strong: string): IntensityStyle {
  return LEVELS[strong] ?? { color: "#9aa5b1", rank: -1 };
}

// 我国风力等级国标（GB/T 19201）最高 17 级，17 级以上统称「17 级以上」，不存在 18 级
const MAX_POWER = 17;

/** 展示层封顶的风力数字，超出国标一律显示 17 */
export function powerValue(power: number | null): string {
  if (power == null) return "—";
  return String(Math.min(MAX_POWER, power));
}

/** 风力单位：达到或超过国标顶格时显示「级以上」，否则「级」 */
export function powerUnit(power: number | null): string {
  if (power == null) return "级";
  return power >= MAX_POWER ? "级以上" : "级";
}

/** 完整风力标签："16级" / "17级以上" / ""（空值） */
export function powerLabel(power: number | null): string {
  if (power == null || power <= 0) return "";
  return `${powerValue(power)}${powerUnit(power)}`;
}

/** 节点半径（px）随风速增大 */
export function radiusForSpeed(speed: number): number {
  return Math.max(3.5, Math.min(11, 3 + (speed - 15) * 0.16));
}

/** 预报机构配色（业内惯例：中国红、日本蓝、美国黄、台湾绿） */
export const AGENCY_COLORS: Record<string, string> = {
  中国: "#ff5c5c",
  日本: "#5eb0ff",
  美国: "#f7c948",
  中国台湾: "#58d68d",
  中国香港: "#c084fc",
};

export function agencyColor(name: string): string {
  return AGENCY_COLORS[name] ?? "#b0bec5";
}
