(() => {
  const PRIVACY_URL = "/privacy/";
  const TERMS_URL = "/terms-of-use/";
  const STATISTICS_URL = "/statistics.html";
  const YOUTUBE_REDIRECT_URI = "https://oneofficeai-1.onrender.com/";
  const MARKER = "data-oneoffice-legal-links";

  try {
    sessionStorage.setItem("yt_oauth_redirect_uri", YOUTUBE_REDIRECT_URI);
  } catch {
    // Ignore storage restrictions; the YouTube connector will surface its normal error.
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
    statistics.addEventListener("click", () => { window.location.href = STATISTICS_URL; });

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
