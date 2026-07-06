/**
 * 台风资讯聚合：Google News RSS（主）/ Bing News RSS（备）。
 * 聚合 BBC、澎湃、上观等数十个分布式媒体来源，服务端抓取无需凭据。
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
    if (!title || !link) continue;
    // Google News 标题带 " - 来源" 后缀，去重展示
    const cleanTitle = source && title.endsWith(` - ${source}`)
      ? title.slice(0, -(source.length + 3))
      : title;
    const t = Date.parse(pub);
    // 无来源标签时退化为文章域名（Bing RSS 不带来源字段）
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

async function fetchRss(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNews(keyword: string, limit = 30): Promise<NewsData> {
  const q = encodeURIComponent(keyword);
  const errors: string[] = [];

  try {
    const xml = await fetchRss(
      `https://news.google.com/rss/search?q=${q}%20when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
    );
    const items = parseRss(xml, limit);
    if (items.length > 0) {
      // 按时间倒序，最新在前
      items.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
      return { keyword, fetchedAt: new Date().toISOString(), provider: "Google News 聚合", items };
    }
    errors.push("google: 0 items");
  } catch (e) {
    errors.push(`google: ${(e as Error).message}`);
  }

  try {
    const xml = await fetchRss(`https://www.bing.com/news/search?q=${q}&format=rss&count=${limit}`);
    const items = parseRss(xml, limit);
    if (items.length > 0) {
      items.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
      return { keyword, fetchedAt: new Date().toISOString(), provider: "Bing News 聚合", items };
    }
    errors.push("bing: 0 items");
  } catch (e) {
    errors.push(`bing: ${(e as Error).message}`);
  }

  throw new Error(`资讯源均不可用: ${errors.join("; ")}`);
}
