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

      const replaceOnce = (from: string, to: string, label: string) => {
        if (!s.includes(from)) {
          throw new Error(`[oneoffice-my-marketer] App.tsx marker not found: ${label}`);
        }
        s = s.replace(from, to);
      };

      if (!s.includes('import MyMarketerPage from "./pages/MyMarketerPage";')) {
        replaceOnce(
          'import React, { useState, useEffect, useRef } from "react";',
          'import React, { useState, useEffect, useRef } from "react";\nimport MyMarketerPage from "./pages/MyMarketerPage";',
          "React import",
        );
      }

      if (!s.includes('"my-marketer": "My Marketer"')) {
        replaceOnce(
          '    profile: "Profile",\n  };',
          '    profile: "Profile",\n    "my-marketer": "My Marketer",\n  };',
          "title map",
        );
      }

      if (!s.includes('  "my-marketer",')) {
        replaceOnce(
          '  "profile",\n] as const;',
          '  "profile",\n  "my-marketer",\n] as const;',
          "app shell sections",
        );
      }

      if (!s.includes("onOpenMarketer")) {
        replaceOnce(
          'function ProfilePage({ user, channels, onLogout, onOpenConnectors }: any) {',
          'function ProfilePage({ user, channels, onLogout, onOpenConnectors, onOpenMarketer }: any) {',
          "ProfilePage signature",
        );
      }

      if (!s.includes('data-testid="button-profile-my-marketer"')) {
        const marker = '      <ExternalAgentButton user={user} />';
        const marketerButton = `      <button
        data-testid="button-profile-my-marketer"
        onClick={onOpenMarketer}
        className="w-full"
      >
        <Glass className="p-6 flex items-center justify-between gap-3 hover:border-white/20 transition">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-violet-400" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-white text-sm font-medium truncate">My Marketer</p>
              <p className="text-slate-500 text-xs mt-0.5 truncate">AI marketing workspace</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
        </Glass>
      </button>

`;
        replaceOnce(marker, marketerButton + marker, "Profile marketer button");
      }

      if (!s.includes('onOpenMarketer={() => setNavView("my-marketer")}')) {
        replaceOnce(
          '            onOpenConnectors={goToConnectors}\n          />',
          '            onOpenConnectors={goToConnectors}\n            onOpenMarketer={() => setNavView("my-marketer")}\n          />',
          "ProfilePage marketer handler",
        );
      }

      if (!s.includes('{navView === "my-marketer" && <MyMarketerPage />}')) {
        replaceOnce(
          '        {navView === "profile" && (',
          '        {navView === "my-marketer" && <MyMarketerPage />}\n        {navView === "profile" && (',
          "My Marketer render",
        );
      }

      return { code: s, map: null };
    },
  };
}
