/**
 * 「聊聊初心」弹窗
 *
 * 面对"官方早有台风路径，你这纯属多此一举"的质疑，用一段平和的自述回应：
 * 数据的价值不在有没有，而在能不能被理解、被用起来、在关键时刻收束成一个动作。
 * 复用 guide 弹窗的覆盖层与 .gm-* 样式，保持单例、遮罩/×/Esc 三种关闭方式。
 */

const SECTIONS: Array<{ h: string; p: string }> = [
  {
    h: "为什么要做",
    p: "官方各家其实都有台风路径数据，这点毫无疑问。但数据的价值，往往不在于“有没有”，而在于能不能被一个普通人快速看懂、用起来。我想做的，是把几家官方的预报路径汇总到一起，配上实时新闻和防台指南，最后收束成一句最朴素的话——“你所在的城市，大概还有多久被波及，现在该做什么”。",
  },
  {
    h: "怎么做出来的",
    p: "从一个念头，到抓数据、本地开发、部署上线，大概花了两三个小时。一方面是想认真验证一下自己借助 AI 的真实动手能力；另一方面也想给“响应速度可以有多快”留个参考——在今天，一个想帮到人的小工具，不必再按周、按月排期，凌晨睡不着的几个小时也能落地。",
  },
  {
    h: "一点心里话",
    p: "有价值的建议我都会认真看、认真收；至于个别的冷嘲热讽，我没有精力一条条回应，就先放过吧。面对天灾，有力出力、有光发光，哪怕只让一个人早一点关窗、早一点收好行李，这件事对我来说就已经值了。",
  },
];

export function openOriginModal(): void {
  if (document.getElementById("origin-modal")) return;
  const overlay = document.createElement("div");
  overlay.id = "origin-modal";
  const body = SECTIONS.map(
    (s) => `<section class="om-sec"><h3>${s.h}</h3><p>${s.p}</p></section>`,
  ).join("");
  overlay.innerHTML = `
    <div class="gm-card" role="dialog" aria-modal="true" aria-label="聊聊初心">
      <div class="gm-head">
        <b>聊聊初心</b>
        <button type="button" class="gm-close" aria-label="关闭">×</button>
      </div>
      <div class="gm-body">${body}
        <p class="om-foot">
          纯个人公益项目 · 无广告 · 数据来源均为官方 · 以官方预警为准<br />
          <a class="om-link" href="https://www.bilibili.com/video/BV148Ms6MET9/" target="_blank" rel="noopener">作者碎碎念 →</a><br />
          <a class="om-link" href="https://space.bilibili.com/343786927" target="_blank" rel="noopener">背景音乐《宫花红》赤星版 · @北极星电台（已获作者授权）→</a>
        </p>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector(".gm-close")!.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
}
