/**
 * 移动端布局控制器
 *
 * 小屏(≤760px)时把桌面的左侧 HUD 与右侧抽屉合并成一套「顶部常驻实况条 + 底部三档位抽屉」:
 *  - HUD 统计块移入顶部 #mstats 常驻条,始终可见、不遮地图;
 *  - 城市倒计时 / 预报机构 / 图例 等区块作为抽屉的新 Tab;
 *  - 抽屉支持 peek / half / full 三档,带拖拽手柄与手势吸附。
 *
 * 桌面(>760px)时全部还原到原始位置,桌面布局零改动。
 * 依赖 app.ts 的抽屉 Tab 切换采用事件委托,故动态新增的 Tab 无需额外绑定。
 */

interface Home {
  node: HTMLElement;
  parent: HTMLElement;
  next: Node | null;
}

const mq = window.matchMedia("(max-width: 760px)");
const homes = new Map<string, Home>();
let mobileBuilt = false;
let sheetInited = false;
let detent: "peek" | "half" | "full" = "peek";

function el<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector(sel);
}

/** 记录节点原始位置,便于切回桌面时还原 */
function rememberHome(id: string): void {
  if (homes.has(id)) return;
  const node = document.getElementById(id);
  if (!node) return;
  homes.set(id, { node, parent: node.parentElement as HTMLElement, next: node.nextSibling });
}

function restoreHome(id: string): void {
  const h = homes.get(id);
  if (!h) return;
  h.parent.insertBefore(h.node, h.next);
}

const MOVABLE = ["hud-stats", "sec-impact", "sec-agency", "sec-legend", "hud-foot", "hud-links"];

function captureHomes(): void {
  for (const id of MOVABLE) rememberHome(id);
}

/** 构建移动端抽屉的额外 Tab 与面板 */
function buildMobileTabs(): void {
  if (mobileBuilt) return;
  const tabs = el<HTMLElement>(".drawer-tabs");
  const body = el<HTMLElement>(".drawer-body");
  if (!tabs || !body) return;

  const mkTab = (panel: string, label: string, before: Element | null): HTMLButtonElement => {
    const b = document.createElement("button");
    b.className = "drawer-tab mobile-tab";
    b.dataset.panel = panel;
    b.setAttribute("role", "tab");
    b.textContent = label;
    tabs.insertBefore(b, before);
    return b;
  };
  const mkPanel = (panel: string): HTMLElement => {
    const s = document.createElement("section");
    s.id = `panel-${panel}`;
    s.className = "drawer-panel mobile-panel";
    s.setAttribute("role", "tabpanel");
    body.appendChild(s);
    return s;
  };

  const firstTab = tabs.querySelector(".drawer-tab");
  mkTab("impact", "倒计时", firstTab);
  const moreTab = mkTab("more", "更多", el<HTMLElement>("#drawer-close"));

  const pImpact = mkPanel("impact");
  const pMore = mkPanel("more");

  const stats = document.getElementById("hud-stats");
  const secImpact = document.getElementById("sec-impact");
  const mstats = document.getElementById("mstats");
  if (stats && mstats) mstats.appendChild(stats);
  if (secImpact) pImpact.appendChild(secImpact);
  for (const id of ["sec-agency", "sec-legend", "hud-foot", "hud-links"]) {
    const n = document.getElementById(id);
    if (n) pMore.appendChild(n);
  }
  void moreTab;
  mobileBuilt = true;
}

function activateTab(panel: string): void {
  document.querySelectorAll(".drawer-tab").forEach((t) => {
    t.classList.toggle("active", (t as HTMLElement).dataset.panel === panel);
  });
  document.querySelectorAll(".drawer-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${panel}`);
  });
}

/** ———— 底部抽屉三档位 + 拖拽 ———— */
function drawerHeight(): number {
  const d = el<HTMLElement>("#drawer");
  return d ? d.offsetHeight : Math.round(window.innerHeight * 0.86);
}

function translateFor(state: "peek" | "half" | "full"): number {
  const h = drawerHeight();
  const wh = window.innerHeight;
  if (state === "full") return 0;
  if (state === "half") return Math.max(0, h - Math.round(wh * 0.52));
  return Math.max(0, h - 96); // peek: 露出手柄 + Tab 条
}

function setDetent(state: "peek" | "half" | "full"): void {
  detent = state;
  const d = el<HTMLElement>("#drawer");
  if (!d) return;
  d.style.transform = `translateY(${translateFor(state)}px)`;
  document.body.classList.toggle("sheet-open", state !== "peek");
}

function initSheet(): void {
  if (sheetInited) return;
  const d = el<HTMLElement>("#drawer");
  const handle = el<HTMLElement>("#drawer-handle");
  if (!d || !handle) return;
  sheetInited = true;

  let startY = 0;
  let startTranslate = 0;
  let dragging = false;

  const onDown = (e: PointerEvent): void => {
    dragging = true;
    startY = e.clientY;
    startTranslate = translateFor(detent);
    d.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const next = Math.min(Math.max(0, startTranslate + dy), drawerHeight() - 72);
    d.style.transform = `translateY(${next}px)`;
  };
  const onUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    d.classList.remove("dragging");
    handle.releasePointerCapture?.(e.pointerId);
    const cur = startTranslate + (e.clientY - startY);
    // 吸附到最近档位
    const cand: Array<["peek" | "half" | "full", number]> = [
      ["full", translateFor("full")],
      ["half", translateFor("half")],
      ["peek", translateFor("peek")],
    ];
    cand.sort((a, b) => Math.abs(a[1] - cur) - Math.abs(b[1] - cur));
    setDetent(cand[0][0]);
  };

  handle.addEventListener("pointerdown", onDown);
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
  // 点击手柄:peek<->half 快捷切换
  handle.addEventListener("click", () => {
    if (!dragging) setDetent(detent === "peek" ? "half" : "peek");
  });

  // 点 Tab 时若处于 peek,自动展开到 half
  el<HTMLElement>(".drawer-tabs")?.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest(".drawer-tab");
    if (t && detent === "peek") setDetent("half");
  });
}

function applyMobile(): void {
  buildMobileTabs();
  initSheet();
  document.body.classList.add("is-mobile");
  const d = el<HTMLElement>("#drawer");
  d?.classList.add("open");
  document.body.classList.remove("drawer-open");
  activateTab("impact");
  // 等布局稳定后再定位,拿到正确的 offsetHeight
  requestAnimationFrame(() => setDetent("peek"));
}

function applyDesktop(): void {
  document.body.classList.remove("is-mobile", "sheet-open");
  // 还原被移动的节点
  for (const id of MOVABLE) restoreHome(id);
  // 清理移动端 Tab / 面板
  document.querySelectorAll(".mobile-tab, .mobile-panel").forEach((n) => n.remove());
  mobileBuilt = false;
  const d = el<HTMLElement>("#drawer");
  if (d) {
    d.style.transform = "";
    d.classList.add("open");
  }
  document.body.classList.add("drawer-open");
  // 恢复桌面默认激活 Tab:实时资讯
  activateTab("news");
}

export function initMobile(): void {
  captureHomes();
  const apply = (): void => (mq.matches ? applyMobile() : applyDesktop());
  apply();
  // 断点/旋转变化时重新编排
  mq.addEventListener("change", apply);
  let rt = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(rt);
    rt = window.setTimeout(() => {
      if (mq.matches && detent) setDetent(detent);
    }, 200);
  });
}

export function isMobile(): boolean {
  return mq.matches;
}
