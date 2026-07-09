/**
 * 背景音乐播放器（已获作者授权使用）
 * 曲目：《宫花红》COVER 赤星版 · @北极星电台（bilibili）
 *
 * 设计约束：
 *  - 顶栏一个小圆钮，点击播放/暂停；绝不自动播放（浏览器策略也不允许）
 *  - 音频懒加载：首次点击才创建 <audio>，不为不听音乐的用户浪费 5.7MB 流量
 *  - 版权意识：播放期间展示署名 pill（点击跳转作者 B 站主页），
 *    另在 HUD 链接区与「聊聊初心」弹窗常驻署名
 */

const MUSIC_URL = "/music/gonghuahong-chixing.mp3";

let audio: HTMLAudioElement | null = null;

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(MUSIC_URL);
    audio.loop = true;
    audio.volume = 0.55; // 背景音乐不该盖过用户对信息的注意力
  }
  return audio;
}

export function initMusic(): void {
  const btn = document.getElementById("btn-music");
  if (!btn) return;
  const credit = document.getElementById("music-credit");

  const sync = (playing: boolean): void => {
    btn.classList.toggle("playing", playing);
    btn.setAttribute("aria-pressed", String(playing));
    btn.setAttribute(
      "aria-label",
      playing ? "暂停背景音乐" : "播放背景音乐《宫花红》赤星版",
    );
    credit?.classList.toggle("show", playing);
  };

  btn.addEventListener("click", async () => {
    const a = ensureAudio();
    if (a.paused) {
      btn.classList.add("loading");
      try {
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
