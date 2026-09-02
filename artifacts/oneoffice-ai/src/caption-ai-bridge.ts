import { auth } from "./lib/firebase";

const BUTTON_ID = "oneoffice-product-caption-ai";
const STYLE_ID = "oneoffice-product-caption-ai-style";

function fieldByPlaceholder(selector: string, placeholder: string): HTMLInputElement | HTMLTextAreaElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (el) => el.getAttribute("placeholder") === placeholder,
  ) as HTMLInputElement | HTMLTextAreaElement | null;
}

function setReactValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID} {
      display:flex;align-items:center;justify-content:center;gap:7px;width:100%;
      margin-top:8px;padding:9px 12px;border-radius:10px;border:1px solid rgba(139,92,246,.35);
      background:linear-gradient(90deg,rgba(139,92,246,.16),rgba(59,130,246,.16));
      color:#c4b5fd;font-size:12px;font-weight:600;cursor:pointer;transition:.2s;
    }
    #${BUTTON_ID}:hover { background:linear-gradient(90deg,rgba(139,92,246,.25),rgba(59,130,246,.25));color:white;border-color:rgba(139,92,246,.6); }
    #${BUTTON_ID}:disabled { opacity:.55;cursor:not-allowed; }
  `;
  document.head.appendChild(style);
}

function findDescriptionBlock(textarea: HTMLTextAreaElement): HTMLElement | null {
  return textarea.parentElement;
}

async function generateCaption(button: HTMLButtonElement, textarea: HTMLTextAreaElement) {
  const user = auth.currentUser;
  if (!user) {
    textarea.focus();
    return;
  }

  const name = fieldByPlaceholder("input", "masalan: AeroSound Pro Earbuds")?.value?.trim() || "";
  const category = (document.querySelector("select") as HTMLSelectElement | null)?.value?.trim() || "";
  const sellPrice = fieldByPlaceholder("input", "masalan: 349,000")?.value?.trim() || "";
  const description = textarea.value.trim();

  if (!name) {
    textarea.focus();
    return;
  }

  button.disabled = true;
  const original = button.innerHTML;
  button.innerHTML = "<span style=\"display:inline-block;width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:oneoffice-spin .7s linear infinite\"></span> Caption yaratilmoqda…";

  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/ai/caption", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        product: {
          name,
          description,
          category,
          price: sellPrice,
          features: [],
        },
        language: "uz",
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Caption yaratilmadi.");
    if (!body?.caption) throw new Error("AI bo'sh caption qaytardi.");

    setReactValue(textarea, body.caption);
    textarea.focus();
    button.innerHTML = "✓ Caption tayyor — tavsif maydoniga qo'yildi";
  } catch (error: any) {
    button.innerHTML = `⚠ ${String(error?.message || "Caption yaratishda xatolik").slice(0, 100)}`;
    setTimeout(() => {
      button.innerHTML = original;
    }, 3500);
  } finally {
    button.disabled = false;
  }
}

function mountButton() {
  const textarea = fieldByPlaceholder("textarea", "Mahsulot haqida bir necha jumla...") as HTMLTextAreaElement | null;
  if (!textarea || document.getElementById(BUTTON_ID)) return;

  injectStyles();
  const parent = findDescriptionBlock(textarea);
  if (!parent) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.innerHTML = "✦ AI bilan professional caption yaratish";
  button.title = "Product Caption AI — faqat mahsulot captioni yaratadi";
  button.addEventListener("click", () => generateCaption(button, textarea));
  parent.appendChild(button);
}

const spinStyle = document.createElement("style");
spinStyle.textContent = "@keyframes oneoffice-spin{to{transform:rotate(360deg)}}";
document.head.appendChild(spinStyle);

const observer = new MutationObserver(() => mountButton());
observer.observe(document.body, { childList: true, subtree: true });
mountButton();
