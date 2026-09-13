import type { Plugin } from "vite";

export default function productImageAiTransform(): Plugin {
  return {
    name: "oneoffice-product-image-ai",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/App.tsx")) return null;

      let s = code;
      const replaceOnce = (from: string, to: string, label: string) => {
        if (!s.includes(from)) throw new Error(`[oneoffice-product-image-ai] App.tsx marker not found: ${label}`);
        s = s.replace(from, to);
      };

      if (!s.includes('import ProductImageGenerator from "./components/ProductImageGenerator";')) {
        replaceOnce(
          'import React, { useState, useEffect, useRef } from "react";',
          'import React, { useState, useEffect, useRef } from "react";\nimport ProductImageGenerator from "./components/ProductImageGenerator";',
          "React import",
        );
      }

      if (!s.includes("<ProductImageGenerator images={images} setImages={setImages} />")) {
        replaceOnce(
          '      ) : (\n        <p className="text-slate-500 text-sm">Hali rasm qo\'shilmadi.</p>\n      )}\n    </div>\n  );\n}\n\n// Shared by ProductForm',
          '      ) : (\n        <p className="text-slate-500 text-sm">Hali rasm qo\'shilmadi.</p>\n      )}\n\n      <ProductImageGenerator images={images} setImages={setImages} />\n    </div>\n  );\n}\n\n// Shared by ProductForm',
          "ProductImagePicker generator",
        );
      }

      return { code: s, map: null };
    },
  };
}
