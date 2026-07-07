/** 台风应对指南内容（依据应急管理部与各省防汛防台指引整理） */

interface GuideSection {
  icon: string;
  title: string;
  tone: "prep" | "during" | "after" | "kit" | "call";
  items: string[];
}

const SECTIONS: GuideSection[] = [
  {
    icon: "①",
    title: "台风来临前 · 提前 24–48 小时",
    tone: "prep",
    items: [
      "关注官方预警信号（蓝→黄→橙→红），红色预警时停止一切户外活动",
      "加固门窗，在玻璃上贴「米」字胶带；收回阳台花盆、杂物等易坠物",
      "储备 3 天量的饮用水、食物和常用药品，提前给手机、充电宝充满电",
      "低洼地区、危旧房、工棚、临时建筑内人员按社区通知提前转移",
      "检查排水口，备好挡水板和沙袋；车辆停到地势高处，远离大树和广告牌",
    ],
  },
  {
    icon: "②",
    title: "台风期间 · 保持室内",
    tone: "during",
    items: [
      "不要外出！台风眼经过时的短暂平静是假象，风力会突然反向增强",
      "远离窗户，尽量待在建筑物中心的房间；不乘坐电梯",
      "不趟积水：水下可能有开盖的井口和漏电，水深过膝时立即绕行",
      "遇到坠落电线，不要靠近，单脚跳跃远离，防止跨步电压触电",
      "如遇险情拨打求助电话，无法通话时用短信/微信定位求援",
    ],
  },
  {
    icon: "③",
    title: "台风过后 · 安全确认",
    tone: "after",
    items: [
      "确认官方解除预警后再外出，警惕次生灾害：山体滑坡、泥石流常滞后发生",
      "被水浸泡过的食物不要食用，饮用水煮沸后再喝",
      "检查燃气、电路，闻到燃气味立即开窗关阀，勿开关电器",
      "拍照记录房屋、车辆受损情况，便于保险理赔",
      "力所能及地帮助邻里，特别是独居老人和行动不便者",
    ],
  },
  {
    icon: "◆",
    title: "应急物资清单",
    tone: "kit",
    items: [
      "饮用水（每人每天 3 升 × 3 天）、压缩食品、罐头",
      "手电筒 + 备用电池、充电宝、收音机",
      "常用药、创可贴、碘伏、慢性病处方药",
      "哨子、防水袋（装证件）、现金少量",
      "保暖衣物、雨衣、防滑鞋",
    ],
  },
  {
    icon: "☎",
    title: "紧急电话 · 点击直接拨打",
    tone: "call",
    items: [
      `<a class="tel" href="tel:119">119 消防救援</a><a class="tel" href="tel:120">120 急救</a><a class="tel" href="tel:110">110 报警</a>`,
      `<a class="tel" href="tel:12379">12379 全国预警</a><a class="tel" href="tel:12121">12121 气象服务</a>`,
      `<a class="tel" href="tel:057112345">0571-12345 浙江防汛</a> · 官方路径 typhoon.slt.zj.gov.cn`,
    ],
  },
];

export function renderGuide(container: HTMLElement): void {
  container.innerHTML = SECTIONS.map(
    (s) => `
    <div class="guide-sec guide-${s.tone}">
      <h3><span class="guide-icon">${s.icon}</span>${s.title}</h3>
      <ul>${s.items.map((it) => `<li>${it}</li>`).join("")}</ul>
    </div>`,
  ).join("");
}
