/**
 * 台风应对指南 2.0：阶段自适应 + 可勾选清单 + 按人数计算的采买建议。
 *
 * 设计原则：慌乱中的人需要的不是文章，是"照着做"。
 *  - 根据当前倒计时（我的位置优先）自动定位到该做什么阶段；
 *  - 每一项都可勾选，进度只存本机 localStorage；
 *  - 采买清单按家庭人数自动计算用量。
 *
 * 内容依据：应急管理部《家庭应急物资储备建议清单》、GB/T 36750-2025
 * 《家用防灾应急包》国家标准、中国气象局台风防御指引整理。
 */
import { formatEta, type ImpactStatus } from "./impact";

type StageId = "s48" | "s24" | "s12" | "s0" | "inside" | "after";

interface Stage {
  id: StageId;
  chip: string;
  title: string;
  tone: string;
  /** 此阶段最重要的三件事，放大显示 */
  focus: [string, string, string];
  items: string[];
}

const STAGES: Stage[] = [
  {
    id: "s48",
    chip: "48 小时前",
    title: "关注准备期",
    tone: "prep",
    focus: ["确认官方预警渠道畅通", "盘点家中物资列出缺口", "和家人约定失联集合点"],
    items: [
      "关注官方预警（12379 短信、气象台官微），确认社区通知群畅通",
      "对照下方采买清单盘点家中储备，列出缺口尽早补齐",
      "和家人约定：断联时的集合地点与市外紧急联系人",
      "评估住所风险：低洼易涝 / 危旧房 / 工棚 / 玻璃幕墙旁，需转移的提前联系社区",
      "手机、充电宝全部充满电，下载离线地图",
    ],
  },
  {
    id: "s24",
    chip: "24–48 小时",
    title: "采买储备期 · 黄金窗口",
    tone: "buy",
    focus: ["按人数备足水和食物", "充满家里每一块电", "慢性病药备足一周"],
    items: [
      "按下方清单完成采买（超市可能限购，先水后食物）",
      "慢性病处方药备足 1 周以上，常用药检查有效期",
      "取少量现金：断电断网时移动支付会失灵",
      "冰箱调到最冷档，冷冻几瓶矿泉水（断电后保温、化开能喝）",
      "浴缸或大桶蓄水，供冲厕、清洁（自来水可能中断）",
    ],
  },
  {
    id: "s12",
    chip: "12–24 小时",
    title: "加固避险期",
    tone: "fix",
    focus: ["清空阳台加固门窗", "车辆转移到高处", "低洼危房立即转移"],
    items: [
      "收回阳台全部花盆、杂物、晾衣架，加固门窗插销",
      "玻璃窗贴胶带并拉上窗帘，减少碎片飞溅伤人",
      "车停高处：远离大树、广告牌、低洼地库；电动车不在楼道充电",
      "检查天台与院落排水口，低层住户备好挡水板、沙袋",
      "危旧房、工棚、低洼住户按社区通知转移——别犹豫，别恋家",
    ],
  },
  {
    id: "s0",
    chip: "12 小时内",
    title: "就位坚守期",
    tone: "hold",
    focus: ["停止一切户外活动", "应急包放到床头", "全家转移到安全房间"],
    items: [
      "停止一切户外活动，全家就位，不再出门",
      "应急包放床头或玄关（10–30 秒内拿得到）",
      "手机开省电模式，收音机放在手边",
      "选定远离窗户的房间（建筑中心最好），铺好休息位",
      "再核对一遍老人、孩子的药品和口粮",
    ],
  },
  {
    id: "inside",
    chip: "影响中",
    title: "台风影响中 · 保持室内",
    tone: "during",
    focus: ["绝对不要外出", "远离所有窗户", "险情立即求援"],
    items: [
      "不要外出！台风眼经过时的短暂平静是假象，风力会突然反向增强",
      "远离窗户，待在建筑物中心的房间；不乘坐电梯",
      "不趟积水：水下可能有开盖井口和漏电，水深过膝立即绕行",
      "遇坠落电线：单脚跳跃远离，防止跨步电压触电",
      "遇险拨打 119 / 110，无法通话时用短信、微信发定位求援",
    ],
  },
  {
    id: "after",
    chip: "台风过后",
    title: "安全确认期",
    tone: "after",
    focus: ["解除预警再外出", "泡水食物不要吃", "检查燃气再用电"],
    items: [
      "确认官方解除预警后再外出；山体滑坡、泥石流常滞后发生",
      "被水浸泡过的食物不要吃，饮用水煮沸后再喝",
      "检查燃气电路：闻到燃气味立即开窗关阀，不碰任何电器开关",
      "拍照记录房屋、车辆受损情况，便于保险理赔",
      "力所能及帮助邻里，特别是独居老人和行动不便者",
    ],
  },
];

/** 采买清单：数量随家庭人数变化。依据应急管理部标准：每人每天 3 升水 × 3 天。 */
interface ShopItem {
  id: string;
  text: (n: number) => string;
}
const SHOP: Array<{ cat: string; icon: string; items: ShopItem[] }> = [
  {
    cat: "水与食物",
    icon: "①",
    items: [
      { id: "w1", text: (n) => `饮用水 <b>${n * 9} 升</b>（每人每天 3 升 × 3 天，约 ${Math.ceil((n * 9) / 4.5)} 桶 4.5L 装）` },
      { id: "w2", text: (n) => `即食食品 <b>${n} 人 × 3 天</b>：压缩饼干、罐头、巧克力（体积小、热量高）` },
      { id: "w3", text: () => "长保牛奶 / 电解质饮料若干" },
    ],
  },
  {
    cat: "电与照明",
    icon: "②",
    items: [
      { id: "e1", text: (n) => `充电宝 <b>每人 1 个</b>（共 ${n} 个），出发前全部充满` },
      { id: "e2", text: () => "手电筒 + 备用电池（别只靠手机，它要留着求救）" },
      { id: "e3", text: () => "防风防水火柴或打火机、长效蜡烛" },
      { id: "e4", text: () => "收音机：断网断电时接收应急广播的唯一渠道" },
    ],
  },
  {
    cat: "医疗急救",
    icon: "③",
    items: [
      { id: "m1", text: () => "家庭急救包：碘伏棉棒、止血贴、纱布绷带、止血带" },
      { id: "m2", text: () => "常用药 + 慢性病处方药 <b>至少 1 周量</b>" },
      { id: "m3", text: () => "口罩、消毒湿巾（灾后卫生条件差）" },
    ],
  },
  {
    cat: "工具与证件",
    icon: "④",
    items: [
      { id: "t1", text: (n) => `高频救生哨 <b>每人 1 个</b>（共 ${n} 个）——受困时省力求救，能救命` },
      { id: "t2", text: () => "防水袋装好证件复印件 + 少量现金" },
      { id: "t3", text: () => "多功能刀、劳保手套、应急逃生绳" },
      { id: "t4", text: () => "分体式雨衣、防滑鞋（比雨伞安全得多）" },
    ],
  },
  {
    cat: "特殊照顾",
    icon: "⑤",
    items: [
      { id: "s1", text: () => "有婴儿：奶粉、尿不湿 × 3 天" },
      { id: "s2", text: () => "有老人：慢病药、老花镜、助行工具放床边" },
      { id: "s3", text: () => "有宠物：粮 × 3 天、牵引绳、航空箱" },
    ],
  },
];

const CALLS = [
  { tel: "119", label: "119 消防救援" },
  { tel: "120", label: "120 急救" },
  { tel: "110", label: "110 报警" },
  { tel: "12379", label: "12379 全国预警" },
  { tel: "12121", label: "12121 气象服务" },
  { tel: "057112345", label: "0571-12345 浙江防汛" },
];

/** ———— 本机状态：勾选进度与家庭人数，绝不上传 ———— */
const CHECK_KEY = "bavi:guide-check:v1";
const PPL_KEY = "bavi:family-size";

let checks: Record<string, boolean> = (() => {
  try {
    return JSON.parse(localStorage.getItem(CHECK_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
})();

let people = (() => {
  const n = Number(localStorage.getItem(PPL_KEY));
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : 3;
})();

function persist(): void {
  try {
    localStorage.setItem(CHECK_KEY, JSON.stringify(checks));
    localStorage.setItem(PPL_KEY, String(people));
  } catch {
    /* 隐私模式下仅本次会话有效 */
  }
}

/** ———— 阶段上下文：由 app.ts 在倒计时刷新时注入 ———— */
let ctx: { status: ImpactStatus | null; etaT: number | null; place: string | null } = {
  status: null,
  etaT: null,
  place: null,
};
let manualStage: StageId | null = null;

function autoStage(): StageId {
  if (ctx.status === "inside") return "inside";
  if (ctx.status === "incoming" && ctx.etaT) {
    const h = (ctx.etaT - Date.now()) / 3600e3;
    if (h > 48) return "s48";
    if (h > 24) return "s24";
    if (h > 12) return "s12";
    return "s0";
  }
  return "s48";
}

export function setGuideContext(
  im: { status: ImpactStatus; etaT: number | null; name: string } | null | undefined,
): void {
  const prev = autoStage();
  ctx = im
    ? { status: im.status, etaT: im.etaT, place: im.name }
    : { status: null, etaT: null, place: null };
  if (autoStage() !== prev) {
    // 阶段推进：清除手动选择并整体重绘，让用户始终看到"现在"该做的事
    manualStage = null;
    repaintAll();
  } else {
    // 阶段未变：只原地更新倒计时文案，不打断勾选与滚动
    for (const c of containers) {
      const el = c.querySelector<HTMLElement>(".gn-eta");
      if (el) el.textContent = etaNoteText();
    }
  }
}

function etaNoteText(): string {
  if (ctx.status === "inside") return `${ctx.place ?? ""}大风影响中`;
  if (ctx.etaT) return `${ctx.place ?? ""}距大风约 ${formatEta(ctx.etaT)}`;
  return "暂无波及预报，提前准备总是对的";
}

/** ———— 渲染 ———— */
const containers = new Set<HTMLElement>();

function stageHtml(stage: Stage): string {
  const done = stage.items.filter((_, i) => checks[`${stage.id}:${i}`]).length;
  return `
    <section class="stage-card tone-${stage.tone}">
      <h3>${stage.title}</h3>
      <ol class="focus3">${stage.focus.map((f) => `<li>${f}</li>`).join("")}</ol>
      <div class="chk-progress"><i style="width:${Math.round((done / stage.items.length) * 100)}%"></i><span>${done}/${stage.items.length}</span></div>
      <ul class="chk-list">
        ${stage.items
          .map((it, i) => {
            const id = `${stage.id}:${i}`;
            const on = checks[id] ? " checked" : "";
            return `<li><label class="chk${checks[id] ? " done" : ""}"><input type="checkbox" data-chk="${id}"${on} /><span>${it}</span></label></li>`;
          })
          .join("")}
      </ul>
    </section>`;
}

function shopHtml(): string {
  return `
    <section class="shop-card">
      <div class="shop-head">
        <h3>物资采买清单</h3>
        <div class="ppl-stepper" role="group" aria-label="家庭人数">
          <button type="button" data-ppl="-1" aria-label="减少人数">−</button>
          <b>${people} 人</b>
          <button type="button" data-ppl="1" aria-label="增加人数">＋</button>
        </div>
      </div>
      <p class="shop-note">用量按 ${people} 人 × 3 天自动计算（72 小时黄金自救期标准）</p>
      ${SHOP.map(
        (cat) => `
        <div class="shop-cat">
          <h4><span>${cat.icon}</span>${cat.cat}</h4>
          <ul class="chk-list">
            ${cat.items
              .map((it) => {
                const id = `shop:${it.id}`;
                return `<li><label class="chk${checks[id] ? " done" : ""}"><input type="checkbox" data-chk="${id}"${checks[id] ? " checked" : ""} /><span>${it.text(people)}</span></label></li>`;
              })
              .join("")}
          </ul>
        </div>`,
      ).join("")}
    </section>`;
}

function paint(container: HTMLElement): void {
  const active = manualStage ?? autoStage();
  const stage = STAGES.find((s) => s.id === active)!;
  const etaNote = etaNoteText();

  container.innerHTML = `
    <div class="guide2">
      <div class="guide-now">
        <span class="gn-label">当前阶段</span>
        <b>${stage.title}</b>
        <span class="gn-eta">${etaNote}</span>
      </div>
      <div class="stage-chips" role="tablist">
        ${STAGES.map(
          (s) =>
            `<button type="button" role="tab" class="stage-chip${s.id === active ? " active" : ""}${s.id === autoStage() ? " auto" : ""}" data-stage="${s.id}">${s.chip}</button>`,
        ).join("")}
      </div>
      ${stageHtml(stage)}
      ${shopHtml()}
      <section class="calls-card">
        <h3>紧急电话 · 点击直接拨打</h3>
        <div class="calls">${CALLS.map((c) => `<a class="tel" href="tel:${c.tel}">${c.label}</a>`).join("")}</div>
      </section>
      <p class="guide-src">依据应急管理部《家庭应急物资储备建议清单》与 GB/T 36750-2025《家用防灾应急包》国家标准整理 · 勾选进度只存在你的手机上 · 防灾决策以官方预警为准</p>
    </div>`;
}

function repaintAll(): void {
  for (const c of containers) {
    if (c.isConnected) paint(c);
    else containers.delete(c);
  }
}

export function renderGuide(container: HTMLElement): void {
  containers.add(container);
  paint(container);
  if (container.dataset.guideWired) return;
  container.dataset.guideWired = "1";

  container.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const chip = t.closest<HTMLElement>(".stage-chip");
    if (chip) {
      manualStage = chip.dataset.stage as StageId;
      repaintAll();
      return;
    }
    const ppl = t.closest<HTMLElement>("[data-ppl]");
    if (ppl) {
      people = Math.min(9, Math.max(1, people + Number(ppl.dataset.ppl)));
      persist();
      repaintAll();
    }
  });
  container.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const id = input.dataset.chk;
    if (!id) return;
    checks[id] = input.checked;
    persist();
    repaintAll();
  });
}

/** ———— 全屏弹窗：一键直达"现在该做什么" ———— */
export function openGuideModal(): void {
  if (document.getElementById("guide-modal")) return;
  const overlay = document.createElement("div");
  overlay.id = "guide-modal";
  overlay.innerHTML = `
    <div class="gm-card" role="dialog" aria-modal="true" aria-label="台风应对指南">
      <div class="gm-head">
        <b>现在该做什么</b>
        <button type="button" class="gm-close" aria-label="关闭">×</button>
      </div>
      <div class="gm-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector<HTMLElement>(".gm-body")!;
  renderGuide(body);

  const close = (): void => {
    containers.delete(body);
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
