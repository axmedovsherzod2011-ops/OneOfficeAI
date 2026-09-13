import type { Plugin } from "vite";

/**
 * Keeps the large legacy App.tsx untouched on disk while wiring the new
 * My Marketer workspace into the existing app shell at build time.
 * This is intentionally small and deterministic so it can later be removed
 * when App.tsx is split into smaller modules.
 */
export default function myMarketerTransform(): Plugin {
  return {
    name: "oneoffice-my-marketer",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/App.tsx")) return null;

      let s = code;

      if (!s.includes('import MyMarketerPage from "./pages/MyMarketerPage";')) {
        s = s.replace(
          'import React, { useState, useEffect, useRef } from "react";',
          'import React, { useState, useEffect, useRef } from "react";\nimport MyMarketerPage from "./pages/MyMarketerPage";',
        );
      }

      s = s.replace(
        '    profile: "Profile",\n  };',
        '    profile: "Profile",\n    "my-marketer": "My Marketer",\n  };',
      );

      s = s.replace(
        '  "profile",\n] as const;',
        '  "profile",\n  "my-marketer",\n] as const;',
      );

      s = s.replace(
        'function ProfilePage({ user, channels, onLogout, onOpenConnectors }: any) {',
        'function ProfilePage({ user, channels, onLogout, onOpenConnectors, onOpenMarketer }: any) {',
      );

      if (!s.includes('data-testid="button-profile-my-marketer"')) {
        const marker = '      <ExternalAgentButton user={user} />';
        const marketerButton = `      <button\n        data-testid="button-profile-my-marketer"\n        onClick={onOpenMarketer}\n        className="w-full"\n      >\n        <Glass className="p-6 flex items-center justify-between gap-3 hover:border-white/20 transition">\n          <div className="flex items-center gap-3 min-w-0">\n            <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">\n              <Sparkles className="h-4 w-4 text-violet-400" />\n            </div>\n            <div className="min-w-0 text-left">\n              <p className="text-white text-sm font-medium truncate">My Marketer</p>\n              <p className="text-slate-500 text-xs mt-0.5 truncate">AI marketing workspace</p>\n            </div>\n          </div>\n          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />\n        </Glass>\n      </button>\n\n`;
        if (s.includes(marker)) s = s.replace(marker, marketerButton + marker);
      }

      if (!s.includes('onOpenMarketer={() => setNavView("my-marketer")}')) {
        s = s.replace(
          '            onOpenConnectors={goToConnectors}\n          />',
          '            onOpenConnectors={goToConnectors}\n            onOpenMarketer={() => setNavView("my-marketer")}\n          />',
        );
      }

      if (!s.includes('{navView === "my-marketer" && <MyMarketerPage />}')) {
        s = s.replace(
          '        {navView === "profile" && (',
          '        {navView === "my-marketer" && <MyMarketerPage />}\n        {navView === "profile" && (',
        );
      }

      return { code: s, map: null };
    },
  };
}
