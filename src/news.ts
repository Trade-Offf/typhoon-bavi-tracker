/** 实时资讯面板：拉取 Worker 聚合的多来源新闻并渲染 */

interface NewsItem {
  title: string;
  source: string;
  link: string;
  time: string;
}

interface NewsData {
  fetchedAt: string;
  provider: string;
  items: NewsItem[];
  stale?: boolean;
  error?: string;
}

const NEWS_REFRESH_MS = 10 * 60 * 1000; // 正常刷新间隔
const NEWS_RETRY_MS = 60 * 1000; // 失败后快速重连

let lastGood: NewsData | null = null;
let timer: number | undefined;

function relTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function render(data: NewsData): void {
  const meta = document.getElementById("news-meta");
  const list = document.getElementById("news-list");
  if (!meta || !list) return;

  const updated = new Date(data.fetchedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  meta.textContent = data.stale
    ? `${data.provider} · ${data.items.length} 条 · 缓存(${updated}) · 重连中…`
    : `${data.provider} · ${data.items.length} 条 · 更新于 ${updated}`;

  list.innerHTML = data.items
    .map(
      (it) => `
    <a class="news-card" href="${it.link}" target="_blank" rel="noopener">
      <p class="news-title">${it.title}</p>
      <div class="news-foot"><span class="news-src">${it.source}</span><span class="news-time">${relTime(
        it.time,
      )}</span></div>
    </a>`,
    )
    .join("");
}

async function load(): Promise<boolean> {
  const meta = document.getElementById("news-meta");
  try {
    const res = await fetch("/api/news", { signal: AbortSignal.timeout(15000) });
    const data = (await res.json()) as NewsData;
    if (!res.ok || data.error || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    lastGood = data;
    render(data);
    return !data.stale; // stale 也展示，但仍按“失败”节奏尽快拉新鲜数据
  } catch {
    // 关键：失败时不清空面板，保留上次成功结果，仅提示重连
    if (lastGood && meta) {
      const updated = new Date(lastGood.fetchedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      meta.textContent = `${lastGood.provider} · 显示上次结果(${updated}) · 重连中…`;
    } else if (meta) {
      meta.textContent = "资讯加载中，正在为你连接多来源…";
    }
    return false;
  }
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(run, ms);
}

async function run(): Promise<void> {
  const ok = await load();
  schedule(ok ? NEWS_REFRESH_MS : NEWS_RETRY_MS);
}

export function initNews(): void {
  run();
}

/** 强制立即刷新资讯（如切回前台时调用），并重置轮询节奏 */
export function refreshNews(): void {
  run();
}
