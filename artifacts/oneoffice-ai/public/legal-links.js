(() => {
  const PRIVACY_URL = "/privacy/";
  const TERMS_URL = "/terms-of-use/";
  const MARKER = "data-oneoffice-legal-links";

  function addLegalLinks() {
    const signOut = document.querySelector('[data-testid="button-profile-signout"]');
    if (!signOut || document.querySelector(`[${MARKER}]`)) return;

    const wrapper = document.createElement("div");
    wrapper.setAttribute(MARKER, "true");
    wrapper.style.cssText = "display:flex;justify-content:center;align-items:center;gap:18px;margin-top:-8px;padding:4px 0 8px;";

    const makeLink = (label, href) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      a.style.cssText = "color:#94a3b8;font-size:12px;text-decoration:none;transition:color .2s;";
      a.addEventListener("mouseenter", () => { a.style.color = "#c4b5fd"; });
      a.addEventListener("mouseleave", () => { a.style.color = "#94a3b8"; });
      return a;
    };

    wrapper.appendChild(makeLink("Privacy Policy", PRIVACY_URL));
    wrapper.appendChild(makeLink("Terms of Use", TERMS_URL));
    signOut.parentNode?.insertBefore(wrapper, signOut.nextSibling);
  }

  addLegalLinks();
  new MutationObserver(addLegalLinks).observe(document.body, { childList: true, subtree: true });
})();
