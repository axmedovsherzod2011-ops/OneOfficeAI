// OneOffice AI External Agent — content script
// Har bir sahifaga floating logotip + chat modal inject qiladi.
//
// SKELETON BOSQICHI: chatga yozilgan buyruqlar hozircha backendga
// yuborilmaydi — `sendToAgent()` funksiyasi shu joyni belgilaydi.
// DOM-skanerlash (`scanPageElements`) esa keyingi bosqichda AI'ga
// yuboriladigan "sahifada nima bor" ma'lumotini shakllantiradi.

(function () {
  if (window.__oneofficeAgentInjected) return;
  window.__oneofficeAgentInjected = true;

  const LOGO_URL = chrome.runtime.getURL("icons/logo128.png");
  const ONEOFFICE_HOST_HINTS = ["oneoffice", "localhost"]; // dashboard aniqlash uchun oddiy stub

  let session = { active: false, minimized: false, messages: [], position: null };
  let els = {};

  // OneOfficeAI dashboard'dagi "External Agent" tugmasi shu orqali
  // extension o'rnatilganini aniqlaydi (postMessage handshake).
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "ONEOFFICE_EXT_PING") {
      window.postMessage(
        { type: "ONEOFFICE_EXT_PONG", version: chrome.runtime.getManifest().version },
        "*"
      );
    }
  });

  function isOneOfficeDashboard() {
    return ONEOFFICE_HOST_HINTS.some((h) => location.hostname.includes(h));
  }

  // ---------- DOM skanerlash (kelgusi AI-agent uchun asos) ----------
  function scanPageElements() {
    const interactive = Array.from(
      document.querySelectorAll("button, a, input, select, textarea, [role='button']")
    ).slice(0, 200);

    return interactive.map((el, i) => {
      if (!el.dataset.oaId) el.dataset.oaId = "oa-" + i;
      return {
        selector: `[data-oa-id="${el.dataset.oaId}"]`,
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 60),
        type: el.getAttribute("type") || null,
      };
    });
  }

  // Keyingi bosqichda: backendga { command, pageUrl, elements } yuboriladi,
  // javobida { action: "click"|"type"|"scroll", selector, value } qaytadi
  // va bu yerda bajariladi (masalan: document.querySelector(selector).click()).
  async function sendToAgent(commandText) {
    const elements = scanPageElements();
    console.log("[OneOffice Agent] Buyruq:", commandText, "| topilgan elementlar:", elements.length);

    // --- STUB javob: hali backend ulanmagan ---
    if (isOneOfficeDashboard()) {
      return "Bu OneOfficeAI paneli. Avval boshqarmoqchi bo'lgan saytingizni (masalan OLX.uz do'koningizni) yangi tabda oching, keyin menga buyruq bering.";
    }
    return `Qabul qildim: "${commandText}". Sahifada ${elements.length} ta boshqariladigan element topdim. (Backend agent hali ulanmagan — bu skeleton bosqich, keyingi qadamda haqiqiy AI qarorlari shu yerga ulanadi.)`;
  }

  // ---------- Session bilan ishlash ----------
  async function loadSession() {
    session = await chrome.runtime.sendMessage({ type: "GET_SESSION" });
    render();
  }

  async function updateSession(patch) {
    session = await chrome.runtime.sendMessage({ type: "UPDATE_SESSION", patch });
    render();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SESSION_UPDATED") {
      session = msg.session;
      render();
    }
  });

  // ---------- UI qurish ----------
  function buildUI() {
    const root = document.createElement("div");
    root.id = "oa-root";
    root.innerHTML = `
      <button id="oa-bubble" title="OneOffice AI">
        <img src="${LOGO_URL}" alt="OneOffice AI" />
        <span id="oa-bubble-dot"></span>
      </button>
      <div id="oa-modal" hidden>
        <div id="oa-modal-header">
          <img src="${LOGO_URL}" alt="" />
          <span>OneOffice AI Agent</span>
          <div id="oa-modal-actions">
            <button id="oa-end-btn" title="Sessiyani tugatish">⏻</button>
            <button id="oa-hide-btn" title="Yashirish">–</button>
          </div>
        </div>
        <div id="oa-messages"></div>
        <div id="oa-inputrow">
          <input id="oa-input" type="text" placeholder="Buyruq yozing..." />
          <button id="oa-send-btn">Yubor</button>
        </div>
      </div>
      <div id="oa-confirm" hidden>
        <div id="oa-confirm-box">
          <p>Sessiyani aniq tugatmoqchimisiz?</p>
          <div id="oa-confirm-actions">
            <button id="oa-confirm-yes">Ha, tugatish</button>
            <button id="oa-confirm-no">Bekor qilish</button>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(root);
    els = {
      root,
      bubble: root.querySelector("#oa-bubble"),
      dot: root.querySelector("#oa-bubble-dot"),
      modal: root.querySelector("#oa-modal"),
      messages: root.querySelector("#oa-messages"),
      input: root.querySelector("#oa-input"),
      sendBtn: root.querySelector("#oa-send-btn"),
      hideBtn: root.querySelector("#oa-hide-btn"),
      endBtn: root.querySelector("#oa-end-btn"),
      confirm: root.querySelector("#oa-confirm"),
      confirmYes: root.querySelector("#oa-confirm-yes"),
      confirmNo: root.querySelector("#oa-confirm-no"),
    };

    attachEvents();
    makeDraggable(els.bubble);
  }

  function attachEvents() {
    els.bubble.addEventListener("click", async (e) => {
      if (els.bubble.dataset.dragged === "1") {
        els.bubble.dataset.dragged = "0";
        return; // drag tugagach klikni e'tiborsiz qoldirish
      }
      if (!session.active) {
        await updateSession({ active: true, minimized: false, messages: [] });
        pushSystemMessage(
          isOneOfficeDashboard()
            ? "Avval boshqarmoqchi bo'lgan saytingizni yangi tabda oching, keyin menga buyruq bering."
            : "Salom! Nima qilishimni yozing (masalan: “OneOffice’dagi mahsulotlarni shu yerga to'liq ko'chir”)."
        );
      } else {
        await updateSession({ minimized: false });
      }
    });

    els.hideBtn.addEventListener("click", () => updateSession({ minimized: true }));

    els.endBtn.addEventListener("click", () => (els.confirm.hidden = false));
    els.confirmNo.addEventListener("click", () => (els.confirm.hidden = true));
    els.confirmYes.addEventListener("click", async () => {
      els.confirm.hidden = true;
      await chrome.runtime.sendMessage({ type: "END_SESSION" });
    });

    els.sendBtn.addEventListener("click", handleSend);
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
    });
  }

  async function handleSend() {
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = "";
    const messages = [...session.messages, { role: "user", text }];
    await updateSession({ messages });

    const reply = await sendToAgent(text);
    pushMessage("agent", reply);
  }

  function pushMessage(role, text) {
    const messages = [...session.messages, { role, text }];
    updateSession({ messages });
  }
  function pushSystemMessage(text) {
    pushMessage("agent", text);
  }

  // ---------- Sudrab ko'chirish (drag) ----------
  function makeDraggable(handle) {
    let startX, startY, startRight, startBottom, moved;

    handle.addEventListener("pointerdown", (e) => {
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = handle.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      handle.setPointerCapture(e.pointerId);

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        const right = Math.max(8, startRight - dx);
        const bottom = Math.max(8, startBottom - dy);
        applyPosition({ right, bottom });
      }
      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        if (moved) {
          handle.dataset.dragged = "1";
          const rect = handle.getBoundingClientRect();
          updateSession({
            position: {
              right: window.innerWidth - rect.right,
              bottom: window.innerHeight - rect.bottom,
            },
          });
        }
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function applyPosition(pos) {
    if (!pos) return;
    els.root.style.setProperty("--oa-right", pos.right + "px");
    els.root.style.setProperty("--oa-bottom", pos.bottom + "px");
  }

  // ---------- Render ----------
  function render() {
    if (!els.root) return;
    applyPosition(session.position);

    const showModal = session.active && !session.minimized;
    els.modal.hidden = !showModal;
    els.dot.style.display = session.active && session.minimized ? "block" : "none";

    els.messages.innerHTML = session.messages
      .map(
        (m) =>
          `<div class="oa-msg oa-msg-${m.role}">${escapeHtml(m.text)}</div>`
      )
      .join("");
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.innerText = str;
    return d.innerHTML;
  }

  buildUI();
  loadSession();
})();
