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
  error?: string;
}

const NEWS_REFRESH_MS = 10 * 60 * 1000;

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
  const meta = document.getElementById("news-meta")!;
  const list = document.getElementById("news-list")!;
  meta.textContent = `${data.provider} · ${data.items.length} 条 · 更新于 ${new Date(
    data.fetchedAt,
  ).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;

  list.innerHTML = data.items
    .map(
      (it) => `
    <a class="news-card" href="${it.link}" target="_blank" rel="noopener">
      <p class="news-title">${it.title}</p>
      <div class="news-foot"><span class="news-src">${it.source}</span><span class="news-time">${relTime(it.time)}</span></div>
    </a>`,
    )
    .join("");
}

async function load(): Promise<void> {
  const meta = document.getElementById("news-meta")!;
  try {
    const res = await fetch("/api/news", { signal: AbortSignal.timeout(15000) });
    const data = (await res.json()) as NewsData;
    if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    render(data);
  } catch (e) {
    meta.textContent = `资讯加载失败（${(e as Error).message}），10 分钟后自动重试`;
  }
}

export function initNews(): void {
  load();
  setInterval(load, NEWS_REFRESH_MS);
}
