/**
 * 离线兜底 Service Worker。
 *
 * 台风天网络最不可靠，而那恰恰是这个网站最被需要的时刻。策略：
 *  - /api/*     网络优先，成功即缓存；断网时退回最近一次成功响应
 *  - 同源静态   缓存优先 + 后台更新（构建产物带哈希，天然不冲突）
 *  - /music/    完全放行，SW 不介入（音频大、且流被 clone 缓存时易连累播放）
 *  - 跨域瓦片   不缓存（体积大且有配额风险，离线时地图退化为深色底）
 *
 * 结果：断网后页面依然能打开，倒计时、应对指南、紧急电话全部可用，
 * 台风数据停留在最近一次成功获取的状态（前端会标注"数据可能滞后"）。
 */
const STATIC_CACHE = "bavi-static-v4";
const DATA_CACHE = "bavi-data-v4";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.add("/"))
      .catch(() => {}) // 首页预缓存失败不应阻断 SW 安装
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 音频走浏览器原生加载：Range 的 206 无法缓存，且 clone 缓存会连累页面拿字节 → 完全放行
  if (url.pathname.startsWith("/music/") || req.headers.has("range")) return;

  if (url.pathname.startsWith("/api/") || req.mode === "navigate") {
    // API 与 HTML 都走网络优先：防灾信息必须最新，断网才退回缓存
    e.respondWith(networkFirst(req));
  } else {
    // 带哈希的静态资源不可变，缓存优先最快
    e.respondWith(cacheFirstWithRefresh(req));
  }
});

/**
 * 安全写缓存：只缓存可缓存的完整同源响应，并吞掉一切异常。
 * cache.put 在遇到 206/opaque/网络中断时会抛错，若不捕获会变成未捕获 promise 异常，
 * 甚至连累与之共享 body 流的页面响应。灾害预警场景下，缓存永远是"锦上添花"，绝不能反噬主流程。
 */
function safePut(cache, req, res) {
  if (!res || !res.ok || res.status !== 200) return;
  if (res.type !== "basic" && res.type !== "default") return;
  try {
    cache.put(req, res).catch(() => {});
  } catch {
    /* 同步抛错也一并吞掉 */
  }
}

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    safePut(cache, req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirstWithRefresh(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      safePut(cache, req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}
