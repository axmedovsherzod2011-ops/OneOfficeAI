// OneOffice AI External Agent — background service worker
//
// Skeleton bosqichida bu fayl faqat sessiya holatini (active/inactive)
// barcha tablar orasida sinxronlab turadi va content scriptlardan kelgan
// xabarlarni markazlashtiradi. Keyingi bosqichda shu yerga:
//   - OneOfficeAI backend bilan autentifikatsiya (token)
//   - Agent buyruqlarini backendga yuborish / javob olish
//   - chrome.debugger orqali pixel-level klik (agar DOM-selector yetmasa)
// qo'shiladi.

const STORAGE_KEY = "oneoffice_agent_session";

async function getSession() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (
    data[STORAGE_KEY] || {
      active: false,
      minimized: false,
      messages: [],
      position: null, // {right, bottom} px
    }
  );
}

async function setSession(patch) {
  const current = await getSession();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "GET_SESSION": {
        sendResponse(await getSession());
        break;
      }
      case "UPDATE_SESSION": {
        const next = await setSession(msg.patch);
        // boshqa ochiq tablardagi widgetlarni ham yangilash uchun broadcast
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id !== sender.tab?.id) {
              chrome.tabs
                .sendMessage(tab.id, { type: "SESSION_UPDATED", session: next })
                .catch(() => {});
            }
          }
        });
        sendResponse(next);
        break;
      }
      case "END_SESSION": {
        const next = await setSession({
          active: false,
          minimized: false,
          messages: [],
        });
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs
              .sendMessage(tab.id, { type: "SESSION_UPDATED", session: next })
              .catch(() => {});
          }
        });
        sendResponse(next);
        break;
      }
      case "OPEN_AGENT_TAB": {
        // OneOfficeAI panelidagi "External Agent" tugmasidan chaqiriladi.
        // Sessiyani globalda faollashtiramiz (shu bilan bubble BARCHA
        // keyingi ochiladigan saytlarda ham chiqadi), so'ng about:blank
        // o'rniga extension'ning o'z (chiroyli) sahifasini ochamiz.
        const next = await setSession({
          active: true,
          minimized: false,
          messages: [
            {
              role: "agent",
              text: "Salom! Boshqarmoqchi bo'lgan sayt yoki do'kon panelingizni shu tabdan oching (yoki yuqoridagi tezkor havolalardan birini bosing), so'ng menga buyruq bering.",
            },
          ],
        });
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs
              .sendMessage(tab.id, { type: "SESSION_UPDATED", session: next })
              .catch(() => {});
          }
        });
        chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") });
        sendResponse(true);
        break;
      }
      default:
        sendResponse(null);
    }
  })();
  return true; // async response
});
