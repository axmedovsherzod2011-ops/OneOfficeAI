(() => {
  const PRIVACY_URL = "/privacy/";
  const TERMS_URL = "/terms-of-use/";
  const STATISTICS_URL = "/statistics.html";
  const YOUTUBE_REDIRECT_URI = "https://oneofficeai-1.onrender.com/";
  const MARKER = "data-oneoffice-legal-links";
  const MODAL_MARKER = "data-oneoffice-statistics-modal";

  try {
    sessionStorage.setItem("yt_oauth_redirect_uri", YOUTUBE_REDIRECT_URI);
  } catch {
    // Ignore storage restrictions; the YouTube connector surfaces its normal error.
  }

  function closeStatistics() {
    document.querySelector(`[${MODAL_MARKER}]`)?.remove();
    document.body.style.overflow = "";
  }

  function openStatistics() {
    if (document.querySelector(`[${MODAL_MARKER}]`)) return;

    const overlay = document.createElement("div");
    overlay.setAttribute(MODAL_MARKER, "true");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9999",
      "background:#020617",
      "display:flex",
      "flex-direction:column",
    ].join(";");

    const toolbar = document.createElement("div");
    toolbar.style.cssText = [
      "height:48px",
      "min-height:48px",
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "padding:0 16px",
      "background:rgba(15,23,42,.96)",
      "border-bottom:1px solid rgba(255,255,255,.08)",
      "backdrop-filter:blur(18px)",
      "font-family:Inter,ui-sans-serif,system-ui,sans-serif",
    ].join(";");

    const title = document.createElement("div");
    title.style.cssText = "display:flex;align-items:center;gap:9px;color:#fff;font-size:13px;font-weight:600;";
    title.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#a78bfa;box-shadow:0 0 14px rgba(167,139,250,.7)"></span><span>Statistics</span>';

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close statistics");
    close.style.cssText = "width:32px;height:32px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.05);color:#94a3b8;font-size:22px;line-height:1;cursor:pointer;";
    close.addEventListener("mouseenter", () => { close.style.color = "#fff"; close.style.background = "rgba(255,255,255,.1)"; });
    close.addEventListener("mouseleave", () => { close.style.color = "#94a3b8"; close.style.background = "rgba(255,255,255,.05)"; });
    close.addEventListener("click", closeStatistics);

    toolbar.appendChild(title);
    toolbar.appendChild(close);

    const frame = document.createElement("iframe");
    frame.src = STATISTICS_URL;
    frame.title = "OneOffice AI detailed statistics";
    frame.style.cssText = "display:block;width:100%;height:calc(100% - 48px);border:0;background:#020617;flex:1;";

    overlay.appendChild(toolbar);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const onKey = (event) => {
      if (event.key === "Escape") {
        closeStatistics();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
  }

  function addLegalLinks() {
    const signOut = document.querySelector('[data-testid="button-profile-signout"]');
    if (!signOut || document.querySelector(`[${MARKER}]`)) return;

    const wrapper = document.createElement("div");
    wrapper.setAttribute(MARKER, "true");
    wrapper.style.cssText = "display:flex;flex-direction:column;gap:10px;margin-top:-8px;padding:4px 0 8px;";

    const statistics = document.createElement("button");
    statistics.type = "button";
    statistics.textContent = "Statistics";
    statistics.style.cssText = "width:100%;padding:11px 14px;border-radius:12px;border:1px solid rgba(167,139,250,.28);background:linear-gradient(90deg,rgba(124,58,237,.16),rgba(37,99,235,.16));color:#ddd6fe;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;";
    statistics.addEventListener("mouseenter", () => {
      statistics.style.borderColor = "rgba(167,139,250,.55)";
      statistics.style.background = "linear-gradient(90deg,rgba(124,58,237,.25),rgba(37,99,235,.25))";
    });
    statistics.addEventListener("mouseleave", () => {
      statistics.style.borderColor = "rgba(167,139,250,.28)";
      statistics.style.background = "linear-gradient(90deg,rgba(124,58,237,.16),rgba(37,99,235,.16))";
    });
    statistics.addEventListener("click", openStatistics);

    const links = document.createElement("div");
    links.style.cssText = "display:flex;justify-content:center;align-items:center;gap:18px;";

    const makeLink = (label, href) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      a.style.cssText = "color:#94a3b8;font-size:12px;text-decoration:none;transition:color .2s;";
      a.addEventListener("mouseenter", () => { a.style.color = "#c4b5fd"; });
      a.addEventListener("mouseleave", () => { a.style.color = "#94a3b8"; });
      return a;
    };

    links.appendChild(makeLink("Privacy Policy", PRIVACY_URL));
    links.appendChild(makeLink("Terms of Use", TERMS_URL));
    wrapper.appendChild(statistics);
    wrapper.appendChild(links);
    signOut.parentNode?.insertBefore(wrapper, signOut.nextSibling);
  }

  addLegalLinks();
  new MutationObserver(addLegalLinks).observe(document.body, { childList: true, subtree: true });
})();
