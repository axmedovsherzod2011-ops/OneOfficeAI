// OneOffice AI External Agent — content script
// Har bir sahifaga floating logotip + chat modal inject qiladi.
//
// Buyruq yozilganda scanPageElements() natijasi backend'ga (Render, /api/
// external-agent/act) yuboriladi, AI JAVOBIDA bitta harakat (click/type/
// scroll) qaytadi, biz uni shu sahifada bajaramiz, so'ng yangilangan
// elementlar bilan qayta so'raymiz — vazifa tugaguncha yoki AI to'xtaguncha
// (runAgentLoop). Sessiya tugaganda /external-agent/summarize'ga bitta
// umumiy xulosa yuboriladi (har bir xabar emas — xarajat uchun).

(function () {
  if (window.__oneofficeAgentInjected) return;
  window.__oneofficeAgentInjected = true;

  const LOGO_URL = chrome.runtime.getURL("icons/logo128.png");
  const ONEOFFICE_HOST_HINTS = ["oneoffice", "localhost"]; // dashboard aniqlash uchun oddiy stub
  const API_BASE = "https://oneofficeai-1.onrender.com"; // Render backend (frontend'dagi VITE_API_BASE_URL bilan bir xil)
  const MAX_AGENT_STEPS = 15; // bitta buyruq uchun cheksiz tsikl bo'lib qolmasligi uchun

  let session = { active: false, minimized: false, messages: [], position: null, authToken: null };
  let els = {};

  // OneOfficeAI dashboard'dagi "External Agent" tugmasi shu orqali
  // extension o'rnatilganini aniqlaydi (postMessage handshake) va
  // Firebase ID token'ni yuboradi — biz uni backend chaqiruvlari uchun
  // saqlab qolamiz (sessiya davomida amal qiladi, muddati tugasa
  // foydalanuvchi dashboard'dan qayta "External Agent"ni bosishi kerak
  // bo'ladi — bu skeleton bosqichda token yangilanishi hali yo'q).
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "ONEOFFICE_EXT_PING") {
      window.postMessage(
        { type: "ONEOFFICE_EXT_PONG", version: chrome.runtime.getManifest().version },
        "*"
      );
      chrome.runtime
        .sendMessage({ type: "OPEN_AGENT_TAB", token: event.data.token ?? null })
        .catch(() => {});
    }
  });

  function isOneOfficeDashboard() {
    return ONEOFFICE_HOST_HINTS.some((h) => location.hostname.includes(h));
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- DOM skanerlash (AI-agent shu asosda qaror qiladi) ----------
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

  // ---------- Backend bilan aloqa ----------
  async function requestAgentDecision(commandText, elements) {
    const res = await fetch(`${API_BASE}/api/external-agent/act`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session.authToken ? { Authorization: `Bearer ${session.authToken}` } : {}),
      },
      body: JSON.stringify({
        command: commandText,
        pageUrl: location.href,
        elements,
        history: session.messages.slice(-10).map((m) => ({
          role: m.role === "user" ? "user" : "agent",
          text: m.text,
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Backend xatosi (${res.status})`);
    }
    return res.json(); // { message, action }
  }

  // ---------- Bitta harakatni haqiqatan bajarish ----------
  function nativeValueSetter(el) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, "value")?.set;
  }

  async function executeAction(action) {
    try {
      if (action.type === "click") {
        const el = document.querySelector(action.selector);
        if (!el) return false;
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.click();
        return true;
      }
      if (action.type === "type") {
        const el = document.querySelector(action.selector);
        if (!el) return false;
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.focus();
        const setter = nativeValueSetter(el);
        if (setter) setter.call(el, action.value);
        else el.value = action.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      if (action.type === "scroll") {
        window.scrollBy({
          top: action.value === "down" ? window.innerHeight * 0.8 : -window.innerHeight * 0.8,
          behavior: "instant",
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error("[OneOffice Agent] Amalni bajarishda xato:", err);
      return false;
    }
  }

  // ---------- Bir buyruqni to'liq bajarish (ko'p qadamli tsikl) ----------
  async function runAgentLoop(commandText) {
    if (isOneOfficeDashboard()) {
      pushMessage(
        "agent",
        "Bu OneOfficeAI paneli. Avval boshqarmoqchi bo'lgan saytingizni (masalan OLX.uz do'koningizni) shu tabda oching, keyin menga buyruq bering."
      );
      return;
    }

    let cmd = commandText;
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const elements = scanPageElements();
      let decision;
      try {
        decision = await requestAgentDecision(cmd, elements);
      } catch (err) {
        console.error("[OneOffice Agent] Backend xatosi:", err);
        pushMessage("agent", "Bog'lanishda xatolik yuz berdi — birozdan keyin qayta urinib ko'ring.");
        break;
      }

      pushMessage("agent", decision.message);

      if (!decision.action) break; // vazifa tugadi yoki qo'shimcha ma'lumot kerak

      const ok = await executeAction(decision.action);
      if (!ok) {
        pushMessage("agent", "Kerakli elementni sahifada topa olmadim, to'xtayapman.");
        break;
      }

      await sleep(700); // sahifa yangilanishi uchun qisqa kutish
      cmd = "(davom eting)";
    }
  }

  // ---------- Sessiya tugaganda: bitta umumiy xulosa yuborish ----------
  async function summarizeSession() {
    if (!session.messages || session.messages.length === 0) return;
    try {
      await fetch(`${API_BASE}/api/external-agent/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session.authToken ? { Authorization: `Bearer ${session.authToken}` } : {}),
        },
        body: JSON.stringify({
          targetUrl: location.href,
          messages: session.messages,
          startedAt: session.startedAt ?? new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.warn("[OneOffice Agent] Sessiya xulosasini saqlab bo'lmadi:", err);
    }
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
      try {
        els.confirm.hidden = true;
        await summarizeSession();
        await chrome.runtime.sendMessage({ type: "END_SESSION" });
      } catch (err) {
        // Extension yangilangandan keyin eski tabda "context invalidated"
        // xatosi chiqishi mumkin — shu holatda tabni yangilash kerak.
        console.error("[OneOffice Agent] Sessiyani tugatishda xato:", err);
        alert("Xatolik yuz berdi. Sahifani (F5) yangilab qayta urinib ko'ring.");
      }
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

    await runAgentLoop(text);
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
    els.bubble.style.display = session.active ? "flex" : "none";
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
