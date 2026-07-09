/**
 * 背景音乐播放器（已获作者授权使用）
 * 曲目：《宫花红》COVER 赤星版 · @北极星电台（bilibili）
 *
 * 设计约束：
 *  - 顶栏一个小圆钮，点击播放/暂停；绝不自动播放（浏览器策略也不允许）
 *  - 懒加载：首次点击才设 src 开始拉取，不为不听音乐的用户浪费流量
 *  - 版权意识：播放时在顶栏播放钮左侧展示署名（曲作者 B 站 + 网站视频），
 *    另在 HUD 链接区与「聊聊初心」弹窗常驻署名
 *
 * 加载策略：主源用 jsDelivr 直连 GitHub 仓库里的音频（跨域）。
 *  - Service Worker 对跨域请求一律放行，绝不 clone/缓存音频流，从根上杜绝
 *    "SW 缓存分支出错连累页面拿字节" 导致的卡死。
 *  - 直接给 <audio> 设 src 后 play() 流式播放，play() 在开始播放时 resolve，
 *    不依赖 blob() 全量下载，也不依赖 canplaythrough（preload=none 时它可能永不触发）。
 *  - 主源失败再退回同源 /music/ 兜底。
 */

const SOURCES = [
  "https://cdn.jsdelivr.net/gh/Trade-Offf/typhoon-bavi-tracker@main/public/music/gonghuahong-chixing.mp3",
  "/music/gonghuahong-chixing.mp3",
];

let audio: HTMLAudioElement | null = null;
let srcIndex = 0;

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.volume = 0.55; // 背景音乐不该盖过用户对信息的注意力
    audio.preload = "none";
  }
  return audio;
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

  let busy = false;

  btn.addEventListener("click", async () => {
    const a = ensureAudio();

    // 正在播放 → 暂停
    if (!a.paused) {
      a.pause();
      sync(false);
      return;
    }

    if (busy) return;
    busy = true;
    btn.classList.add("loading");
    try {
      if (!a.src) a.src = SOURCES[srcIndex];
      await a.play();
      sync(true);
    } catch {
      // 首选源（jsDelivr）失败 → 逐个退回后续兜底源
      let played = false;
      while (srcIndex < SOURCES.length - 1) {
        srcIndex++;
        a.src = SOURCES[srcIndex];
        try {
          await a.play();
          played = true;
          break;
        } catch {
          /* 继续尝试下一个源 */
        }
      }
      sync(played);
    } finally {
      busy = false;
      btn.classList.remove("loading");
    }
  });
}
