/**
 * 官方发布区：置顶展示已获授权转载的官方公众号推文（当前为「杭州应急管理」）。
 *
 * 公众号没有公开 API，改用仓库内 public/official.json 人工维护：新增/下线一条即 push
 * 上线，Cloudflare 静态托管天然带缓存。为空或加载失败则整块不渲染，绝不影响下方实时资讯。
 *
 * 合规：这里只做「转载官方已公开信息 + 标注来源 + 跳转原文」，不改写、不二次解读。
 */

interface OfficialItem {
  title: string;
  url: string;
  source: string;
  date?: string;
}

interface OfficialData {
  items: OfficialItem[];
  consentText?: string;
}

const DEFAULT_CONSENT = "经官方授权转载 · 内容以原文为准";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function isHttp(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

function render(host: HTMLElement, data: OfficialData): void {
  const items = (data.items || []).filter((it) => it && it.title && isHttp(it.url));
  if (items.length === 0) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  const consent = esc(data.consentText || DEFAULT_CONSENT);
  const cards = items
    .map(
      (it) => `
      <a class="official-card" href="${esc(it.url)}" target="_blank" rel="noopener">
        <p class="official-title">${esc(it.title)}</p>
        <div class="official-foot">
          <span class="official-src">${esc(it.source || "官方发布")}</span>
          ${it.date ? `<span class="official-date">${esc(it.date)}</span>` : ""}
        </div>
      </a>`,
    )
    .join("");
  host.hidden = false;
  host.innerHTML = `
    <div class="official-head">
      <span class="official-badge">官方</span>
      <span class="official-head-label">官方发布</span>
    </div>
    ${cards}
    <p class="official-consent">${consent}</p>`;
}

/** 拉取并渲染官方发布区；失败静默（保持隐藏），不打断实时资讯 */
export async function initOfficialFeed(): Promise<void> {
  const host = document.getElementById("official-feed");
  if (!host) return;
  try {
    // 5 分钟粒度的版本参数：绕过 CDN 边缘对旧副本的缓存，人工更新后最多 5 分钟生效
    const v = Math.floor(Date.now() / 300000);
    const res = await fetch(`/official.json?v=${v}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as OfficialData;
    render(host, data);
  } catch {
    host.innerHTML = "";
    host.hidden = true;
  }
}
