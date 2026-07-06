/** 正能量文案轮播：面对天灾时的秩序感与互助意识 */

const SLOGANS: string[] = [
  "风雨同舟，守望相助",
  "提前一分准备，减少十分损失",
  "台风眼的平静是假象，请留在室内",
  "不趟积水，不近危墙，安全是回家最近的路",
  "把充电宝充满，把牵挂说出口",
  "灾害无情，人间有爱",
  "看一眼独居的邻居，多一份社区的安心",
  "科学防台，不慌不乱",
  "风会停，雨会歇，我们一起等天晴",
  "每一次守护，都是文明的回答",
];

const ROTATE_MS = 8000;

export function initSlogans(): void {
  const el = document.getElementById("slogan-text")!;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % SLOGANS.length;
    el.classList.add("fade-out");
    setTimeout(() => {
      el.textContent = SLOGANS[i];
      el.classList.remove("fade-out");
    }, 400);
  }, ROTATE_MS);
}
