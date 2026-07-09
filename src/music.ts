/**
 * 背景音乐播放器（已获作者授权使用）
 * 曲目：《宫花红》COVER 赤星版 · @北极星电台（bilibili）
 *
 * 设计约束：
 *  - 顶栏一个小圆钮，点击播放/暂停；绝不自动播放（浏览器策略也不允许）
 *  - 音频懒加载：首次点击才拉取，不为不听音乐的用户浪费 5.7MB 流量
 *  - 版权意识：播放时在顶栏播放钮左侧展示署名（曲作者 B 站 + 网站视频），
 *    另在 HUD 链接区与「聊聊初心」弹窗常驻署名
 *
 * 加载策略：整段 fetch 成 Blob 再播放。
 *  - <audio> 流式播放 + preload="none" 时 load() 未必真正下载，canplaythrough
 *    可能永不触发导致按钮一直转；且边缘节点对 Range 分段请求处理不稳定。
 *  - Blob 全量下载完再喂给 <audio>，play() 立即可播，行为确定、无 Range 依赖。
 */

const MUSIC_URL = "/music/gonghuahong-chixing.mp3";

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let loading = false;

async function ensureLoaded(): Promise<HTMLAudioElement> {
  if (audio) return audio;
  const res = await fetch(MUSIC_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`music HTTP ${res.status}`);
  const blob = await res.blob();
  objectUrl = URL.createObjectURL(blob);
  const a = new Audio(objectUrl);
  a.loop = true;
  a.volume = 0.55; // 背景音乐不该盖过用户对信息的注意力
  audio = a;
  return a;
}

export function initMusic(): void {
  const btn = document.getElementById("btn-music");
  if (!btn) return;
  const bar = document.getElementById("music-bar");

  const sync = (playing: boolean): void => {
    btn.classList.toggle("playing", playing);
    btn.setAttribute("aria-pressed", String(playing));
    btn.setAttribute(
      "aria-label",
      playing ? "暂停背景音乐" : "播放背景音乐《宫花红》赤星版",
    );
    bar?.classList.toggle("show", playing);
    document.body.classList.toggle("music-on", playing);
  };

  btn.addEventListener("click", async () => {
    // 已在播放 → 暂停
    if (audio && !audio.paused) {
      audio.pause();
      sync(false);
      return;
    }
    // 已加载但暂停 → 直接续播
    if (audio) {
      try {
        await audio.play();
        sync(true);
      } catch {
        /* 被浏览器策略拒绝：保持静音 */
      }
      return;
    }
    // 首次：下载后播放（期间按钮显示 loading）
    if (loading) return;
    loading = true;
    btn.classList.add("loading");
    try {
      const a = await ensureLoaded();
      await a.play();
      sync(true);
    } catch {
      /* 下载失败或被策略拒绝：保持静音，不打扰用户 */
    } finally {
      loading = false;
      btn.classList.remove("loading");
    }
  });
}
