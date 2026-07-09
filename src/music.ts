/**
 * 背景音乐播放器（已获作者授权使用）
 * 曲目：《宫花红》COVER 赤星版 · @北极星电台（bilibili）
 *
 * 设计约束：
 *  - 顶栏一个小圆钮，点击播放/暂停；绝不自动播放（浏览器策略也不允许）
 *  - 音频懒加载：首次点击才拉取，不为不听音乐的用户浪费 5.7MB 流量
 *  - 版权意识：播放时在顶栏播放钮左侧展示署名（曲作者 B 站 + 网站视频），
 *    另在 HUD 链接区与「聊聊初心」弹窗常驻署名
 */

const MUSIC_URL = "/music/gonghuahong-chixing.mp3";
const LOAD_TIMEOUT_MS = 120_000;

let audio: HTMLAudioElement | null = null;
let blobUrl: string | null = null;

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.volume = 0.55;
    audio.preload = "none";
  }
  return audio;
}

function waitCanPlay(a: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (a.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve();
      return;
    }
    const finish = (ok: boolean, err?: unknown) => {
      clearTimeout(timer);
      a.removeEventListener("canplaythrough", onReady);
      a.removeEventListener("error", onErr);
      ok ? resolve() : reject(err);
    };
    const timer = setTimeout(() => finish(false, new Error("audio load timeout")), LOAD_TIMEOUT_MS);
    const onReady = () => finish(true);
    const onErr = () => finish(false, a.error ?? new Error("audio load error"));
    a.addEventListener("canplaythrough", onReady, { once: true });
    a.addEventListener("error", onErr, { once: true });
  });
}

/** 用 Blob URL 加载，绕过边缘节点对 Range 的错误处理 */
async function loadViaBlob(a: HTMLAudioElement): Promise<void> {
  const res = await fetch(MUSIC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(blob);
  a.src = blobUrl;
  a.load();
  await waitCanPlay(a);
}

async function preparePlayback(a: HTMLAudioElement): Promise<void> {
  if (a.src && a.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return;
  try {
    if (!a.src) {
      a.src = MUSIC_URL;
      a.load();
    }
    await waitCanPlay(a);
  } catch {
    await loadViaBlob(a);
  }
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
    const a = ensureAudio();
    if (a.paused) {
      btn.classList.add("loading");
      try {
        await preparePlayback(a);
        await a.play();
        sync(true);
      } catch {
        /* 加载失败或被浏览器策略拒绝：保持静音状态，不打扰用户 */
      } finally {
        btn.classList.remove("loading");
      }
    } else {
      a.pause();
      sync(false);
    }
  });
}
