// ---------------------------------------------------------------------------
// Shared DuckDuckGo-backed web/image search helpers. No API key required.
// Used by routes/enrich.ts (single-product lookup) and ai/productCard.ts
// (the multi-query deep research pass).
// ---------------------------------------------------------------------------

export interface DdgImage {
  url: string;
  thumbnail: string;
  title: string;
  source: string;
}

export async function searchProductImages(query: string, count = 6): Promise<DdgImage[]> {
  try {
    // Step 1: get the VQD token DDG requires for image searches
    const vqdRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      },
    );
    const html = await vqdRes.text();
    const vqdMatch = html.match(/vqd=["']?([^"'&\s]+)["']?/);
    const vqd = vqdMatch?.[1];
    if (!vqd) return [];

    // Step 2: fetch image results
    const url = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}&f=,,,,,&p=1`;
    const imgRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://duckduckgo.com/",
        Accept: "application/json",
      },
    });
    const data = (await imgRes.json()) as {
      results?: Array<{ image?: string; thumbnail?: string; title?: string; url?: string }>;
    };

    return (data.results ?? [])
      .filter((r) => r.image)
      .slice(0, count)
      .map((r) => ({
        url: r.image!,
        thumbnail: r.thumbnail || r.image!,
        title: r.title || query,
        source: r.url || "",
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo TEXT search — finds real pages about the exact product (name +
// seller notes like brand/origin + category) so the AI grounds the
// description in facts it actually found, instead of inventing generic copy.
// ---------------------------------------------------------------------------

export interface WebSnippet {
  title: string;
  snippet: string;
  source: string;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "");
}

export async function searchProductWebInfo(query: string, count = 5): Promise<WebSnippet[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
    });
    const html = await res.text();

    const results: WebSnippet[] = [];
    const blockRegex =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) && results.length < count) {
      const [, url, titleHtml, snippetHtml] = match;
      const title = decodeHtmlEntities(titleHtml).trim();
      const snippet = decodeHtmlEntities(snippetHtml).trim();
      if (title || snippet) {
        results.push({ title, snippet, source: url });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// Turns raw search hits into a compact block an AI prompt can cite facts
// from. Kept short (title + snippet only) to stay within token budget while
// still giving the model real, product-specific grounding.
export function formatWebContext(results: WebSnippet[]): string {
  if (!results.length) return "";
  return results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}`).join("\n\n");
}
