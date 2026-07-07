/**
 * 离线兜底 Service Worker。
 *
 * 台风天网络最不可靠，而那恰恰是这个网站最被需要的时刻。策略：
 *  - /api/*     网络优先，成功即缓存；断网时退回最近一次成功响应
 *  - 同源静态   缓存优先 + 后台更新（构建产物带哈希，天然不冲突）
 *  - 跨域瓦片   不缓存（体积大且有配额风险，离线时地图退化为深色底）
 *
 * 结果：断网后页面依然能打开，倒计时、应对指南、紧急电话全部可用，
 * 台风数据停留在最近一次成功获取的状态（前端会标注"数据可能滞后"）。
 */
const STATIC_CACHE = "bavi-static-v2";
const DATA_CACHE = "bavi-data-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.add("/"))
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

  if (url.pathname.startsWith("/api/") || req.mode === "navigate") {
    // API 与 HTML 都走网络优先：防灾信息必须最新，断网才退回缓存
    e.respondWith(networkFirst(req));
  } else {
    // 带哈希的静态资源不可变，缓存优先最快
    e.respondWith(cacheFirstWithRefresh(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
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
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}
