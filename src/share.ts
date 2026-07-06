/** 转发扩散：二维码弹窗（动态加载 qrcode，不阻塞首屏） */
import { isMobile } from "./mobile";

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

let modal: HTMLElement | null = null;
let qrCanvas: HTMLCanvasElement | null = null;
let currentPayload: SharePayload | null = null;

function ensureModal(): HTMLElement {
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "share-modal";
  modal.className = "share-modal";
  modal.innerHTML = `
    <div class="share-card" role="dialog" aria-labelledby="share-title" aria-modal="true">
      <button class="share-close" type="button" aria-label="关闭">×</button>
      <h2 id="share-title">扫码转发 · 提前告知身边人</h2>
      <p class="share-desc" id="share-desc"></p>
      <div class="share-qr-wrap">
        <canvas id="share-qr" width="220" height="220" aria-label="分享二维码"></canvas>
      </div>
      <p class="share-url" id="share-url"></p>
      <div class="share-actions">
        <button type="button" class="share-btn primary" id="share-copy">复制链接</button>
        <button type="button" class="share-btn" id="share-save">保存二维码</button>
        <button type="button" class="share-btn" id="share-native" hidden>系统分享</button>
      </div>
      <p class="share-hint">微信扫一扫 · 或保存图片发到群聊</p>
    </div>`;

  document.body.appendChild(modal);
  qrCanvas = modal.querySelector("#share-qr") as HTMLCanvasElement;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeShareModal();
  });
  modal.querySelector(".share-close")!.addEventListener("click", closeShareModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.classList.contains("open")) closeShareModal();
  });

  modal.querySelector("#share-copy")!.addEventListener("click", async () => {
    if (!currentPayload) return;
    const btn = modal!.querySelector("#share-copy") as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(`${currentPayload.text}\n${currentPayload.url}`);
      btn.textContent = "已复制";
      setTimeout(() => (btn.textContent = "复制链接"), 2000);
    } catch {
      btn.textContent = "复制失败";
    }
  });

  modal.querySelector("#share-save")!.addEventListener("click", () => {
    if (!qrCanvas) return;
    const a = document.createElement("a");
    a.download = "台风巴威-转发二维码.png";
    a.href = qrCanvas.toDataURL("image/png");
    a.click();
  });

  modal.querySelector("#share-native")!.addEventListener("click", async () => {
    if (!currentPayload || !navigator.share) return;
    try {
      await navigator.share(currentPayload);
    } catch {
      /* 用户取消 */
    }
  });

  return modal;
}

export function closeShareModal(): void {
  modal?.classList.remove("open");
  document.body.classList.remove("share-open");
}

export async function openShareModal(payload: SharePayload): Promise<void> {
  currentPayload = payload;
  const el = ensureModal();
  el.querySelector("#share-desc")!.textContent = payload.text;
  el.querySelector("#share-url")!.textContent = payload.url;

  const hasShare = typeof navigator.share === "function";
  const nativeBtn = el.querySelector("#share-native") as HTMLButtonElement;
  const copyBtn = el.querySelector("#share-copy") as HTMLButtonElement;
  const actions = el.querySelector(".share-actions") as HTMLElement;
  const hint = el.querySelector(".share-hint") as HTMLElement;
  const title = el.querySelector("#share-title") as HTMLElement;

  nativeBtn.hidden = !hasShare;
  // 手机端优先「系统分享」：可直接发给微信/朋友，扫自己屏幕的二维码没意义
  if (hasShare) {
    nativeBtn.classList.add("primary");
    copyBtn.classList.remove("primary");
    actions.insertBefore(nativeBtn, actions.firstChild);
  } else {
    copyBtn.classList.add("primary");
  }

  if (isMobile()) {
    title.textContent = "转发给身边人 · 提前预警";
    hint.textContent = hasShare
      ? "点「系统分享」发到微信/群聊，或长按二维码保存"
      : "复制链接发给好友，或保存二维码图片";
  } else {
    hint.textContent = "微信扫一扫 · 或保存图片发到群聊";
  }

  const QRCode = await import("qrcode");
  await QRCode.toCanvas(qrCanvas!, payload.url, {
    width: 220,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0f1c", light: "#ffffff" },
  });

  el.classList.add("open");
  document.body.classList.add("share-open");
}
