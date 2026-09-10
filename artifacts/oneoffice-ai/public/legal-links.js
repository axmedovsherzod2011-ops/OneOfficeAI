(() => {
  const PRIVACY_URL = "/privacy/";
  const TERMS_URL = "/terms-of-use/";
  const YOUTUBE_REDIRECT_URI = "https://oneofficeai-1.onrender.com/";

  try {
    sessionStorage.setItem("yt_oauth_redirect_uri", YOUTUBE_REDIRECT_URI);
  } catch {
    // Ignore storage restrictions; the YouTube connector surfaces its normal error.
  }

  function addLegalLinks() {
    const signOut = document.querySelector('[data-testid="button-profile-signout"]');
    if (!signOut || document.querySelector("[data-oneoffice-legal-links]")) return;

    const links = document.createElement("div");
    links.setAttribute("data-oneoffice-legal-links", "true");
    links.style.cssText = "display:flex;justify-content:center;align-items:center;gap:18px;margin-top:2px;padding:4px 0 8px;";

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
    signOut.parentNode?.insertBefore(links, signOut.nextSibling);
  }

  addLegalLinks();
  new MutationObserver(addLegalLinks).observe(document.body, { childList: true, subtree: true });
})();
