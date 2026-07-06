/**
 * 台风资讯聚合：Google News RSS（主）+ Bing News RSS（补充）。
 *
 * 两个源并行抓取、合并去重，任一源可用即返回结果；仅当两源都为空/失败时才抛错。
 * 上游对数据中心 IP 有概率限流（429/503）或跳转，故：
 *   1) 每个源带一次重试；
 *   2) 主源 Google 稳定输出上百条，Bing 作为补充而非硬依赖；
 *   3) 失败兜底由 Worker 层的“上次成功缓存”负责，本模块只管抓取与解析。
 */

export interface NewsItem {
  title: string;
  source: string;
  link: string;
  time: string; // ISO
}

export interface NewsData {
  keyword: string;
  fetchedAt: string;
  provider: string;
  items: NewsItem[];
  stale?: boolean;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const block of blocks) {
    const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
    // Google 用 <source url="">，Bing 用 <News:Source>
    const source = decodeEntities(
      block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ??
        block.match(/<News:Source[^>]*>([\s\S]*?)<\/News:Source>/i)?.[1] ??
        "",
    );
    if (!title || !link || !/^https?:\/\//.test(link)) continue;
    // Google News 标题带 " - 来源" 后缀，去重展示
    const cleanTitle =
      source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title;
    const t = Date.parse(pub);
    let fallbackSource = "";
    try {
      fallbackSource = new URL(link).hostname.replace(/^www\./, "");
    } catch {
      /* 链接异常时留空 */
    }
    items.push({
      title: cleanTitle,
      source: source || fallbackSource || "新闻来源",
      link,
      time: isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(),
    });
    if (items.length >= limit) break;
  }
  return items;
}

async function fetchRss(url: string, tries = 2): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml" },
        signal: controller.signal,
        // 让 Cloudflare 顺带缓存上游响应，降低被限流概率
        cf: { cacheTtl: 120, cacheEverything: true },
      } as RequestInit);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 标题归一化后作为去重键，避免同一新闻多源重复 */
function dedupeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s“”"'’‘·—\-|:：，,。.！!？?（）()【】\[\]]/g, "")
    .slice(0, 24);
}

export async function fetchNews(keyword: string, limit = 30): Promise<NewsData> {
  const q = encodeURIComponent(keyword);
  const sources = [
    {
      name: "Google 新闻",
      url: `https://news.google.com/rss/search?q=${q}%20when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
    },
    {
      name: "Bing 新闻",
      url: `https://www.bing.com/news/search?q=${q}&format=rss&count=${limit}`,
    },
  ];

  const collected: NewsItem[] = [];
  const okProviders: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    sources.map(async (s) => {
      try {
        const xml = await fetchRss(s.url);
        const items = parseRss(xml, limit);
        if (items.length > 0) {
          collected.push(...items);
          okProviders.push(s.name);
        } else {
          errors.push(`${s.name}: 0 条`);
        }
      } catch (e) {
        errors.push(`${s.name}: ${(e as Error).message}`);
      }
    }),
  );

  if (collected.length === 0) {
    throw new Error(errors.join("; ") || "无可用资讯源");
  }

  // 合并去重 + 时间倒序
  const seen = new Set<string>();
  const merged = collected.filter((it) => {
    const key = dedupeKey(it.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  merged.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));

  return {
    keyword,
    fetchedAt: new Date().toISOString(),
    provider: `${okProviders.join(" + ")}聚合`,
    items: merged.slice(0, limit),
  };
}
