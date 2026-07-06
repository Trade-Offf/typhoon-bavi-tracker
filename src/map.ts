import maplibregl from "maplibre-gl";
import type { FeatureCollection, Feature } from "geojson";
import type { TyphoonData, TrackPoint } from "./types";
import { intensityOf, radiusForSpeed, agencyColor } from "./intensity";
import { windCircleRing, stateAtTime, type TrackState } from "./geo";
import { formatEta, type CityImpact } from "./impact";

type FC = FeatureCollection;

const EMPTY: FC = { type: "FeatureCollection", features: [] };

/**
 * 中文底图：高德卫星影像 + 透明中文注记（国内 CDN，行政边界符合中国标准）。
 * 不再使用 glyphs 字体服务，地图文字全部由注记瓦片与 DOM 标记承担。
 */
const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "amap-sat": {
      type: "raster",
      tiles: [1, 2, 3, 4].map(
        (i) => `https://webst0${i}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}`,
      ),
      tileSize: 256,
      maxzoom: 18,
      attribution: "© 高德地图",
    },
    "amap-label": {
      type: "raster",
      tiles: [1, 2, 3, 4].map(
        (i) =>
          `https://webst0${i}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scale=1&style=8`,
      ),
      tileSize: 256,
      maxzoom: 18,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0a0f1c" } },
    {
      id: "amap-sat",
      type: "raster",
      source: "amap-sat",
      paint: { "raster-brightness-max": 0.72, "raster-saturation": -0.35, "raster-contrast": 0.06 },
    },
    { id: "amap-label", type: "raster", source: "amap-label", paint: { "raster-opacity": 0.82 } },
  ],
};

export class TyphoonMap {
  readonly map: maplibregl.Map;
  private eyeMarker: maplibregl.Marker | null = null;
  private eyeEl: HTMLDivElement | null = null;
  private data: TyphoonData | null = null;
  private hiddenAgencies = new Set<string>();
  private dayMarkers: maplibregl.Marker[] = [];
  private cityMarkers = new Map<string, maplibregl.Marker>();
  private impacts: CityImpact[] = [];
  private cityPopup: maplibregl.Popup | null = null;

  constructor(container: string) {
    this.map = new maplibregl.Map({
      container,
      style: BASE_STYLE,
      center: [138, 18],
      zoom: 4,
      attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  }

  onReady(cb: () => void): void {
    if (this.map.loaded()) {
      cb();
      return;
    }
    // 个别瓦片请求失败会推迟 load 事件，用 idle 兜底保证初始化必然执行
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      cb();
    };
    this.map.on("load", fire);
    this.map.once("idle", fire);
    setTimeout(fire, 8000); // 最终兜底：底图异常也不阻塞数据渲染
  }

  /** 初始化所有数据源与图层（仅调用一次） */
  setupLayers(): void {
    const map = this.map;
    const srcs = [
      "wind-r7", "wind-r10", "wind-r12",
      "track-full", "track-progress", "track-points",
      "forecast-lines", "forecast-points", "pulse",
    ];
    for (const id of srcs) map.addSource(id, { type: "geojson", data: EMPTY });

    // —— 风圈（由外到内：7 级 / 10 级 / 12 级）——
    const windSpec: Array<[string, string, number]> = [
      ["wind-r7", "#ffd23f", 0.10],
      ["wind-r10", "#ff9636", 0.14],
      ["wind-r12", "#ff3131", 0.20],
    ];
    for (const [id, color, opacity] of windSpec) {
      map.addLayer({
        id: `${id}-fill`, type: "fill", source: id,
        paint: { "fill-color": color, "fill-opacity": opacity },
      });
      map.addLayer({
        id: `${id}-line`, type: "line", source: id,
        paint: { "line-color": color, "line-opacity": 0.55, "line-width": 1.2 },
      });
    }

    // —— 完整历史路径（暗色打底，回放时可见"剩余"路径）——
    map.addLayer({
      id: "track-full-line", type: "line", source: "track-full",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#3d4a63", "line-width": 2, "line-dasharray": [1, 2] },
    });

    // —— 已走过路径：按强度分段着色，带辉光 ——
    map.addLayer({
      id: "track-glow", type: "line", source: "track-progress",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"], "line-width": 9,
        "line-opacity": 0.22, "line-blur": 6,
      },
    });
    map.addLayer({
      id: "track-line", type: "line", source: "track-progress",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 3 },
    });

    // —— 观测节点：大小映射风速，颜色映射强度 ——
    map.addLayer({
      id: "track-points-c", type: "circle", source: "track-points",
      paint: {
        "circle-radius": ["get", "r"],
        "circle-color": ["get", "color"],
        "circle-stroke-color": "rgba(10,15,28,0.9)",
        "circle-stroke-width": 1.4,
        "circle-opacity": 0.95,
      },
    });

    // —— 各机构预报路径（虚线）——
    map.addLayer({
      id: "forecast-lines-l", type: "line", source: "forecast-lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"], "line-width": 2,
        "line-dasharray": [0.1, 2.2], "line-opacity": 0.9,
      },
    });
    map.addLayer({
      id: "forecast-points-c", type: "circle", source: "forecast-points",
      paint: {
        "circle-radius": 3.2,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.85,
        "circle-stroke-color": "rgba(10,15,28,0.9)",
        "circle-stroke-width": 1,
      },
    });

    // —— 当前位置扩散脉冲（数据驱动半径，动画见 tickPulse）——
    map.addLayer({
      id: "pulse-c", type: "circle", source: "pulse",
      paint: {
        "circle-radius": ["get", "r"],
        "circle-color": "transparent",
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 1.6,
        "circle-stroke-opacity": ["get", "o"],
      },
    });

    this.bindPopups();
  }

  private bindPopups(): void {
    const map = this.map;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: "280px" });
    const show = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat).setHTML(String(f.properties?.html ?? "")).addTo(map);
    };
    const hide = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    for (const layer of ["track-points-c", "forecast-points-c"]) {
      map.on("mousemove", layer, show);
      map.on("mouseleave", layer, hide);
    }
  }

  /** 全量数据更新（首次与每次自动刷新时调用） */
  setData(data: TyphoonData): void {
    this.data = data;
    const pts = data.points;

    this.src("track-full").setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) },
      }],
    });

    this.src("track-points").setData({
      type: "FeatureCollection",
      features: pts.map((p) => ({
        type: "Feature",
        properties: {
          color: intensityOf(p.strong).color,
          r: radiusForSpeed(p.speed),
          html: pointHtml(p),
        },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    });

    // 每日 08 时日期标注：DOM 标记替代 symbol 图层，摆脱字体服务依赖
    for (const m of this.dayMarkers) m.remove();
    this.dayMarkers = pts
      .filter((p) => p.time.endsWith("08:00"))
      .map((p) => {
        const el = document.createElement("div");
        el.className = "day-label";
        el.textContent = `${parseInt(p.time.slice(5, 7))}月${parseInt(p.time.slice(8, 10))}日`;
        return new maplibregl.Marker({ element: el, anchor: "top", offset: [0, 10] })
          .setLngLat([p.lng, p.lat])
          .addTo(this.map);
      });

    this.updateForecastLayers();
    if (!this.eyeMarker) this.createEyeMarker();
  }

  toggleAgency(agency: string, visible: boolean): void {
    if (visible) this.hiddenAgencies.delete(agency);
    else this.hiddenAgencies.add(agency);
    this.updateForecastLayers();
  }

  private updateForecastLayers(): void {
    if (!this.data) return;
    const last = this.data.points[this.data.points.length - 1];
    const lines: Feature[] = [];
    const points: Feature[] = [];
    for (const fc of this.data.forecasts) {
      if (this.hiddenAgencies.has(fc.agency) || fc.points.length === 0) continue;
      const color = agencyColor(fc.agency);
      const coords: [number, number][] = [[last.lng, last.lat], ...fc.points.map((q) => [q.lng, q.lat] as [number, number])];
      lines.push({ type: "Feature", properties: { color }, geometry: { type: "LineString", coordinates: coords } });
      for (const q of fc.points) {
        points.push({
          type: "Feature",
          properties: { color, html: forecastHtml(fc.agency, q.time, q.strong, q.speed, q.pressure) },
          geometry: { type: "Point", coordinates: [q.lng, q.lat] },
        });
      }
    }
    this.src("forecast-lines").setData({ type: "FeatureCollection", features: lines });
    this.src("forecast-points").setData({ type: "FeatureCollection", features: points });
  }

  /** 更新城市波及标记：可点击查看倒计时与建议 */
  setImpacts(impacts: CityImpact[]): void {
    this.impacts = impacts;
    for (const im of impacts) {
      let marker = this.cityMarkers.get(im.name);
      if (!marker) {
        const el = document.createElement("button");
        el.className = "city-marker";
        el.innerHTML = `<i></i><span>${im.name}</span>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.focusCity(im.name, false);
        });
        marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([im.lng, im.lat])
          .addTo(this.map);
        this.cityMarkers.set(im.name, marker);
      }
      marker.getElement().dataset.status = im.status;
    }
  }

  /** 聚焦城市并弹出倒计时卡片（fly=true 时带镜头飞行） */
  focusCity(name: string, fly = true): void {
    const im = this.impacts.find((x) => x.name === name);
    if (!im) return;
    if (fly) {
      this.map.flyTo({ center: [im.lng, im.lat], zoom: Math.max(this.map.getZoom(), 6.2), duration: 1200 });
    }
    this.cityPopup?.remove();
    this.cityPopup = new maplibregl.Popup({ closeButton: true, offset: 30, maxWidth: "300px" })
      .setLngLat([im.lng, im.lat])
      .setHTML(cityPopupHtml(im))
      .addTo(this.map);
  }

  /** 回放期间淡出预报，聚焦历史演进 */
  setForecastDim(dim: boolean): void {
    const o = dim ? 0.12 : 0.9;
    this.map.setPaintProperty("forecast-lines-l", "line-opacity", o);
    this.map.setPaintProperty("forecast-points-c", "circle-opacity", dim ? 0.1 : 0.85);
  }

  private createEyeMarker(): void {
    const el = document.createElement("div");
    el.className = "typhoon-eye";
    el.innerHTML = `
      <svg viewBox="0 0 100 100" class="eye-spiral">
        <g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round">
          <path d="M50 8 A42 42 0 0 1 92 50" />
          <path d="M50 92 A42 42 0 0 1 8 50" />
        </g>
        <circle cx="50" cy="50" r="13" fill="none" stroke="currentColor" stroke-width="6"/>
      </svg>`;
    this.eyeEl = el;
    this.eyeMarker = new maplibregl.Marker({ element: el }).setLngLat([0, 0]).addTo(this.map);
  }

  /** 按插值状态渲染台风本体：眼、风圈、进度轨迹 */
  renderState(state: TrackState): void {
    if (!this.data) return;
    const pts = this.data.points;

    if (this.eyeMarker && this.eyeEl) {
      this.eyeMarker.setLngLat([state.lng, state.lat]);
      const style = intensityOf(state.strong);
      this.eyeEl.style.color = style.color;
      // 强度越强旋转越快：超强台风 1.1s/圈，热带低压 3.2s/圈
      const dur = Math.max(1.1, 3.2 - style.rank * 0.42);
      this.eyeEl.style.setProperty("--spin-duration", `${dur}s`);
    }

    const windRings: Array<["wind-r7" | "wind-r10" | "wind-r12", TrackState["r7"]]> = [
      ["wind-r7", state.r7], ["wind-r10", state.r10], ["wind-r12", state.r12],
    ];
    for (const [id, quad] of windRings) {
      this.src(id).setData(
        quad
          ? {
              type: "FeatureCollection",
              features: [{
                type: "Feature", properties: {},
                geometry: { type: "Polygon", coordinates: [windCircleRing(state.lng, state.lat, quad)] },
              }],
            }
          : EMPTY,
      );
    }

    // 进度轨迹：完整段按强度分段 + 当前插值余段
    const features: Feature[] = [];
    for (let i = 0; i < state.index; i++) {
      features.push(segment(pts[i], pts[i + 1]));
    }
    const a = pts[state.index];
    if (state.frac > 0 || state.index === pts.length - 1) {
      features.push({
        type: "Feature",
        properties: { color: intensityOf(a.strong).color },
        geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [state.lng, state.lat]] },
      });
    }
    this.src("track-progress").setData({ type: "FeatureCollection", features });
  }

  /** 扩散脉冲动画帧：phase ∈ [0,1) */
  tickPulse(state: TrackState, phase: number): void {
    const color = intensityOf(state.strong).color;
    const features: Feature[] = [0, 0.5].map((offset) => {
      const p = (phase + offset) % 1;
      return {
        type: "Feature",
        properties: { r: 10 + p * 42, o: (1 - p) * 0.5, color },
        geometry: { type: "Point", coordinates: [state.lng, state.lat] },
      };
    });
    this.src("pulse").setData({ type: "FeatureCollection", features });
  }

  stateAt(t: number): TrackState {
    return stateAtTime(this.data!.points, t);
  }

  /** 视野覆盖实测 + 全部预报路径 */
  fitToData(): void {
    if (!this.data) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of this.data.points) bounds.extend([p.lng, p.lat]);
    for (const fc of this.data.forecasts) for (const q of fc.points) bounds.extend([q.lng, q.lat]);
    const drawerOpen = document.body.classList.contains("drawer-open") && window.innerWidth >= 1100;
    this.map.fitBounds(bounds, {
      padding: { top: 110, bottom: 140, left: 360, right: drawerOpen ? 420 : 70 },
      duration: 1600,
      essential: true,
    });
  }

  private src(id: string): maplibregl.GeoJSONSource {
    return this.map.getSource(id) as maplibregl.GeoJSONSource;
  }
}

function segment(a: TrackPoint, b: TrackPoint): Feature {
  return {
    type: "Feature",
    properties: { color: intensityOf(b.strong).color },
    geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
  };
}

function pointHtml(p: TrackPoint): string {
  const c = intensityOf(p.strong).color;
  return `<div class="tip">
    <div class="tip-head"><i style="background:${c}"></i>${p.time}</div>
    <div class="tip-row"><span>强度</span><b style="color:${c}">${p.strong}${p.power ? ` ${p.power}级` : ""}</b></div>
    <div class="tip-row"><span>风速</span><b>${p.speed} m/s</b></div>
    <div class="tip-row"><span>气压</span><b>${p.pressure} hPa</b></div>
    ${p.moveDir ? `<div class="tip-row"><span>移向</span><b>${p.moveDir} ${p.moveSpeed ?? "—"} km/h</b></div>` : ""}
  </div>`;
}

function cityPopupHtml(im: CityImpact): string {
  const statusLabel =
    im.status === "inside"
      ? `<b class="ci-inside">大风影响中</b>`
      : im.status === "incoming"
        ? `<b class="ci-incoming">${formatEta(im.etaT!)}后波及</b>`
        : `<b class="ci-watch">大风圈外</b>`;
  const eta =
    im.status === "incoming"
      ? `<div class="tip-row"><span>预计7级风圈到达</span><b>${new Date(im.etaT!).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</b></div>`
      : "";
  return `<div class="tip city-tip">
    <div class="tip-head"><i class="ci-dot ci-${im.status}"></i>${im.name} · ${statusLabel}</div>
    ${eta}
    <div class="tip-row"><span>预报期内最近距离</span><b>${im.minDistKm} km</b></div>
    <p class="city-advice">${im.advice}</p>
    <p class="city-note">基于中央气象台预报路径与当前7级风圈估算，请以官方预警为准</p>
  </div>`;
}

function forecastHtml(agency: string, time: string, strong: string, speed: number | null, pressure: number | null): string {
  const c = agencyColor(agency);
  return `<div class="tip">
    <div class="tip-head"><i style="background:${c}"></i>${agency} · 预报</div>
    <div class="tip-row"><span>时间</span><b>${time}</b></div>
    ${strong ? `<div class="tip-row"><span>强度</span><b>${strong}</b></div>` : ""}
    ${speed ? `<div class="tip-row"><span>风速</span><b>${speed} m/s</b></div>` : ""}
    ${pressure ? `<div class="tip-row"><span>气压</span><b>${pressure} hPa</b></div>` : ""}
  </div>`;
}
