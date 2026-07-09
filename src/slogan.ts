/** 正能量文案轮播：秩序感、互助意识与人定胜天的信念 */

const SLOGANS: string[] = [
  "风雨同舟，守望相助",
  "雄关漫道真如铁，而今迈步从头越",
  "提前一分准备，减少十分损失",
  "不管风吹浪打，胜似闲庭信步",
  "台风眼的平静是假象，请留在室内",
  "军民团结如一人，试看天下谁能敌",
  "不趟积水，不近危墙，安全是回家最近的路",
  "今日长缨在手，何时缚住苍龙",
  "把充电宝充满，把牵挂说出口",
  "头上高山，风卷红旗过大关",
  "灾害无情，人间有爱",
  "红雨随心翻作浪，青山着意化为桥",
  "看一眼独居的邻居，多一份社区的安心",
  "更立西江石壁，截断巫山云雨",
  "科学防台，不慌不乱",
  "唤起工农千百万，同心干，不周山下红旗乱",
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
