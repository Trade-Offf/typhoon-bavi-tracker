/**
 * Cloudflare Worker：台风数据边缘代理
 *
 * - GET /api/typhoon/:tfid   归一化后的台风数据（主源：浙江水利厅，备源：中央气象台 NMC）
 * - GET /api/health          健康检查
 * - 其余请求由 Cloudflare 静态资源（dist/）接管
 *
 * 边缘缓存 5 分钟：台风报文 3 小时一更，5 分钟已远超实时性要求，
 * 同时把上游压力隔离在边缘节点。
 */
import { normalizeZj, normalizeNmc, type TyphoonData } from "./normalize";
import { fetchNews } from "./news";

interface Env {
  ASSETS: Fetcher;
}

const CACHE_TTL = 300; // 秒
const UPSTREAM_TIMEOUT = 10_000; // 毫秒

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": `public, max-age=${CACHE_TTL}`,
};

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 主源：浙江省水利厅台风 API（聚合中/日/美/台四机构预报） */
async function fromZhejiang(tfid: string): Promise<TyphoonData> {
  const res = await fetchWithTimeout(`https://typhoon.slt.zj.gov.cn/Api/TyphoonInfo/${tfid}`, {
    headers: { referer: "https://typhoon.slt.zj.gov.cn/wap.html" },
  });
  if (!res.ok) throw new Error(`ZJ upstream HTTP ${res.status}`);
  const raw: any = await res.json();
  if (!raw || !Array.isArray(raw.points) || raw.points.length === 0) {
    throw new Error("ZJ upstream 返回空数据");
  }
  return normalizeZj(raw);
}

/** 备源：中央气象台 NMC。需先查 list 拿内部 id，再取详情 */
async function fromNmc(tfid: string): Promise<TyphoonData> {
  const year = tfid.slice(0, 4);
  const listRes = await fetchWithTimeout(
    `http://typhoon.nmc.cn/weatherservice/typhoon/jsons/list_${year}`,
    { headers: { referer: "http://typhoon.nmc.cn/web.html" } },
  );
  if (!listRes.ok) throw new Error(`NMC list HTTP ${listRes.status}`);
  const listText = await listRes.text();
  const lm = listText.match(/^[\w$]+\((.*)\)\s*;?\s*$/s);
  if (!lm) throw new Error("NMC list JSONP 无法解析");
  const shortId = tfid.slice(2); // "202609" -> "2609"
  const entry = (JSON.parse(lm[1]).typhoonList as any[]).find((t) => t[3] === shortId);
  if (!entry) throw new Error(`NMC 未找到台风 ${tfid}`);

  const viewRes = await fetchWithTimeout(
    `http://typhoon.nmc.cn/weatherservice/typhoon/jsons/view_${entry[0]}`,
    { headers: { referer: "http://typhoon.nmc.cn/web.html" } },
  );
  if (!viewRes.ok) throw new Error(`NMC view HTTP ${viewRes.status}`);
  return normalizeNmc(await viewRes.text());
}

async function handleTyphoon(request: Request, tfid: string): Promise<Response> {
  if (!/^\d{6}$/.test(tfid)) {
    return new Response(JSON.stringify({ error: "台风编号格式应为 6 位数字，如 202609" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  // DOM lib 与 workers-types 的 CacheStorage 类型冲突，运行时以 Workers 为准
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL(`/api/typhoon/${tfid}`, request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const errors: string[] = [];
  let data: TyphoonData | null = null;
  try {
    data = await fromZhejiang(tfid);
  } catch (e) {
    errors.push(`primary: ${(e as Error).message}`);
  }
  if (!data) {
    try {
      data = await fromNmc(tfid);
    } catch (e) {
      errors.push(`fallback: ${(e as Error).message}`);
    }
  }
  if (!data) {
    return new Response(JSON.stringify({ error: "所有数据源均不可用", detail: errors }), {
      status: 502,
      headers: { ...JSON_HEADERS, "cache-control": "no-store" },
    });
  }

  const response = new Response(JSON.stringify(data), { headers: JSON_HEADERS });
  await cache.put(cacheKey, response.clone());
  return response;
}

const NEWS_CACHE_TTL = 600; // 资讯缓存 10 分钟

async function handleNews(request: Request): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL("/api/news/bavi-v3", request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchNews("台风巴威", 30);
    const response = new Response(JSON.stringify(data), {
      headers: { ...JSON_HEADERS, "cache-control": `public, max-age=${NEWS_CACHE_TTL}` },
    });
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 502,
      headers: { ...JSON_HEADERS, "cache-control": "no-store" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: JSON_HEADERS });
    }

    if (url.pathname === "/api/news") return handleNews(request);

    const m = url.pathname.match(/^\/api\/typhoon\/(\w+)$/);
    if (m) return handleTyphoon(request, m[1]);

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
