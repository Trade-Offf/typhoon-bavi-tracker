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
 * 音源策略（面向国内可靠性）：
 *  - 主源＝同源 /music/：该文件由本站 Cloudflare 与整站同链路提供，
 *    "只要网站能打开，它就一定能取到"，是国内最稳的源。SW 已对 /music/ 完全放行。
 *  - 兜底＝jsDelivr(GitHub)：仅当同源失败才用；cdn.jsdelivr.net 在国内可能被
 *    污染/封锁，故绝不作主源，否则被墙时连接卡住会拖死播放。
 *  - 卡顿超时保护：任一源若在超时内没真正播起来（playing 事件），立即判失败换下一个，
 *    按钮绝不无限转圈。灾害预警页面，任何交互都必须有确定的终态。
 */

interface Source {
  url: string;
  timeoutMs: number;
}

const SOURCES: Source[] = [
  { url: "/music/gonghuahong-chixing.mp3", timeoutMs: 8000 },
  {
    url: "https://cdn.jsdelivr.net/gh/Trade-Offf/typhoon-bavi-tracker@main/public/music/gonghuahong-chixing.mp3",
    timeoutMs: 12000,
  },
];

let audio: HTMLAudioElement | null = null;
let ready = false; // 已成功从某个源播起来过，之后暂停/续播不必重新选源

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.volume = 0.55; // 背景音乐不该盖过用户对信息的注意力
    audio.preload = "none";
  }
  return audio;
}

/**
 * 从指定源尝试播放，以 playing 事件为“真正播起来”的判据。
 * 超时或 error 都判失败——调用方据此切换下一个源，杜绝卡死。
 */
function playFrom(a: HTMLAudioElement, src: Source): Promise<boolean> {
  a.src = src.url;
  a.load();
  const started = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("error", onError);
      resolve(ok);
    };
    const onPlaying = (): void => finish(true);
    const onError = (): void => finish(false);
    const timer = setTimeout(() => finish(false), src.timeoutMs);
    a.addEventListener("playing", onPlaying, { once: true });
    a.addEventListener("error", onError, { once: true });
  });
  // play() 的 rejection（如策略拦截）不直接判定结果，统一交给 playing/error/超时
  a.play().catch(() => {});
  return started;
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

    // 已成功加载过 → 直接续播，不重新选源
    if (ready) {
      try {
        await a.play();
        sync(true);
      } catch {
        sync(false);
      }
      return;
    }

    if (busy) return;
    busy = true;
    btn.classList.add("loading");
    try {
      let ok = false;
      for (const src of SOURCES) {
        a.pause(); // 停掉上一个可能仍在卡顿的连接
        ok = await playFrom(a, src);
        if (ok) break;
      }
      ready = ok;
      if (!ok) a.pause();
      sync(ok);
    } finally {
      busy = false;
      btn.classList.remove("loading");
    }
  });
}
