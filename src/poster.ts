/**
 * 分享海报生成：把横版视觉（来源信息条 + 台风眼 + 三数据卡）接到分享弹窗里，
 * 用当前真实数据现场画一张可下载/可分享的图。
 *
 * 合规注意：本海报仅转载并可视化官方公开数据，不得模仿官方预警信号（红色预警带）
 * 或以本站名义"发布预警"。顶/底信息条一律标注数据来源与"非官方预警"声明。
 */
import { powerValue, powerUnit } from "./intensity";

export interface PosterData {
  typhoonNo: string; // 如 "2026 年第 9 号"
  nameCn: string;
  nameEn: string;
  speed: number;
  pressure: number;
  power: number | null;
  strong: string;
  /** 有聚焦城市时展示"该城市还剩多久"，否则展示通用口号 */
  focusCity?: string;
  focusEtaText?: string; // "约 32 小时" / "已进入影响范围"
}

const SANS = '"PingFang SC","Microsoft YaHei",sans-serif';
const BG = "#0a0f1c";
const INK = "#e8eefb";
const DIM = "#8fa3c7";
const RED = "#ff3131";
const AMBER = "#ffd23f";
const BAND = "#141c30"; // 信息条底色：中性深色，避免模仿官方红色预警信号
const BAND_BORDER = "rgba(126,155,205,0.28)";
const SOURCE_NOTE = "数据来源：中央气象台、浙江省水利厅（官方公开信息）· 本站不发布预警，以官方为准";

const W = 1600;
const H = 900;
const SAFE_L = 96;
const SAFE_R = W - 96;

function roundRect(ctx: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(a + r, b);
  ctx.arcTo(a + w, b, a + w, b + h, r);
  ctx.arcTo(a + w, b + h, a, b + h, r);
  ctx.arcTo(a, b + h, a, b, r);
  ctx.arcTo(a, b, a + w, b, r);
  ctx.closePath();
}

function drawEye(ctx: CanvasRenderingContext2D, ex: number, ey: number): void {
  const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 300);
  glow.addColorStop(0, "rgba(255,49,49,0.16)");
  glow.addColorStop(1, "rgba(255,49,49,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(ex - 300, ey - 300, 600, 600);
  for (let i = 7; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(ex, ey, i * 20, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(143,163,199,${0.07 + (7 - i) * 0.015})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.save();
  ctx.strokeStyle = "rgba(255,49,49,0.5)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    const a0 = (k * 2 * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(ex, ey, 80, a0, a0 + Math.PI * 0.42);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ex, ey, 21, 0, Math.PI * 2);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex, ey, 10, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();
}

function drawPoster(ctx: CanvasRenderingContext2D, d: PosterData): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  drawEye(ctx, 1230, 280);

  // 顶部信息条：来源标注式（非官方预警信号）
  ctx.fillStyle = BAND;
  ctx.fillRect(0, 0, W, 74);
  ctx.strokeStyle = BAND_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 74);
  ctx.lineTo(W, 74);
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.font = `800 30px ${SANS}`;
  ctx.textAlign = "left";
  ctx.fillText("台风路径信息", SAFE_L, 37);
  ctx.fillStyle = DIM;
  ctx.font = `500 20px ${SANS}`;
  const label = "台风路径信息";
  ctx.font = `800 30px ${SANS}`;
  const labelW = ctx.measureText(label).width;
  ctx.font = `500 20px ${SANS}`;
  ctx.fillText("· 数据来源：中央气象台", SAFE_L + labelW + 14, 39);
  ctx.font = `600 22px ${SANS}`;
  ctx.fillStyle = DIM;
  ctx.textAlign = "right";
  ctx.fillText(`${d.typhoonNo} · ${d.nameCn} ${d.nameEn}`, SAFE_R, 37);
  ctx.textAlign = "left";

  // 主标题：有聚焦城市时用真实倒计时，否则用通用口号
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `900 72px ${SANS}`;
  ctx.fillText("超强台风「巴威」逼近", SAFE_L, 250);
  const y2 = 350;
  ctx.fillStyle = INK;
  let seg1 = "你的城市 ";
  let seg2 = "还剩多久？";
  if (d.focusCity && d.focusEtaText) {
    seg1 = `${d.focusCity} `;
    seg2 = d.focusEtaText === "已进入影响范围" ? "或已进入影响范围" : `约${d.focusEtaText}（估算）`;
  }
  ctx.fillText(seg1, SAFE_L, y2);
  const seg1w = ctx.measureText(seg1).width;
  ctx.fillStyle = AMBER;
  ctx.fillText(seg2, SAFE_L + seg1w, y2);
  ctx.fillStyle = RED;
  ctx.fillRect(SAFE_L, y2 + 26, 100, 8);

  ctx.fillStyle = DIM;
  ctx.font = `400 26px ${SANS}`;
  ctx.fillText("官方预报路径 · 影响时间估算 · 应急指南，一页看清", SAFE_L, 425);

  // 三张数据卡
  const cardY = 490;
  const cardH = 250;
  const gap = 22;
  const cardW = (SAFE_R - SAFE_L - gap * 2) / 3;
  const stats: Array<[string, string, string, boolean]> = [
    [String(Math.round(d.speed)), "米/秒", "中心最大风速", true],
    [String(Math.round(d.pressure)), "百帕", "中心最低气压", false],
    [powerValue(d.power), powerUnit(d.power), `底层风力 · ${d.strong || "超强台风"}`, false],
  ];
  stats.forEach((s, i) => {
    const cx0 = SAFE_L + i * (cardW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, cx0, cardY, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    roundRect(ctx, cx0, cardY, cardW, cardH, 14);
    ctx.stroke();

    const mid = cx0 + cardW / 2;
    ctx.font = `900 108px ${SANS}`;
    const numW = ctx.measureText(s[0]).width;
    ctx.font = `600 30px ${SANS}`;
    const unitW = ctx.measureText(s[1]).width;
    const startX = mid - (numW + 12 + unitW) / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = s[3] ? RED : INK;
    ctx.font = `900 108px ${SANS}`;
    ctx.fillText(s[0], startX, cardY + 140);
    ctx.fillStyle = "rgba(226,238,251,0.8)";
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText(s[1], startX + numW + 12, cardY + 140);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(143,163,199,0.85)";
    ctx.font = `400 25px ${SANS}`;
    ctx.fillText(s[2], mid, cardY + 200);
  });
  ctx.textAlign = "left";

  // 底部信息条：来源与免责声明（非官方预警信号）
  ctx.fillStyle = BAND;
  ctx.fillRect(0, H - 92, W, 92);
  ctx.strokeStyle = BAND_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 92);
  ctx.lineTo(W, H - 92);
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(226,238,251,0.72)";
  ctx.font = `400 20px ${SANS}`;
  ctx.fillText(SOURCE_NOTE, SAFE_L, H - 46);
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = `900 36px ${SANS}`;
  ctx.fillText("chinaupdated.com →", SAFE_R, H - 46);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function renderCanvas(d: PosterData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  drawPoster(ctx, d);
  return canvas;
}

/** 生成并触发下载/系统分享；支持带图片的原生分享面板（微信等），不支持时回退为直接下载 */
export async function sharePoster(d: PosterData): Promise<void> {
  const canvas = renderCanvas(d);
  const filename = "台风巴威-分享海报.png";

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob && navigator.canShare) {
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "台风巴威实时追踪", text: "转发给你关心的人，提前准备" });
        return;
      } catch {
        /* 用户取消系统分享，退回直接下载 */
      }
    }
  }
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
