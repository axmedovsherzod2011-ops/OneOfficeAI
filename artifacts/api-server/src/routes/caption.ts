import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";

const router = Router();

type ProductCaptionInput = {
  product?: {
    name?: unknown;
    description?: unknown;
    category?: unknown;
    price?: unknown;
    features?: unknown;
  };
  language?: unknown;
};

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

const PROVIDERS = [
  { name: "Groq", key: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  { name: "Cerebras", key: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", model: "llama-3.3-70b" },
  { name: "Mistral", key: "MISTRAL_API_KEY", url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
] as const;

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateInput(body: ProductCaptionInput) {
  const raw = body?.product;
  if (!raw || typeof raw !== "object") return null;
  const name = cleanString(raw.name, 200);
  if (!name) return null;
  const features = Array.isArray(raw.features)
    ? raw.features.filter((feature): feature is string => typeof feature === "string").map((feature) => feature.trim().slice(0, 300)).filter(Boolean).slice(0, 20)
    : [];
  return {
    name,
    description: cleanString(raw.description, 2000),
    category: cleanString(raw.category, 200),
    price: cleanString(raw.price, 100),
    features,
    language: cleanString(body.language, 20) || "uz",
  };
}

async function callCpuServer(product: ReturnType<typeof validateInput>): Promise<string> {
  const baseUrl = process.env.CAPTION_CPU_URL?.trim().replace(/\/$/, "");
  if (!baseUrl || !product) throw new Error("CAPTION_CPU_URL is not configured");
  const response = await fetch(`${baseUrl}/caption`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      product: { name: product.name, description: product.description, category: product.category, price: product.price, features: product.features },
      language: product.language,
    }),
  });
  if (!response.ok) throw new Error(`CPU server ${response.status}`);
  const data = (await response.json()) as { caption?: unknown };
  if (typeof data.caption !== "string" || !data.caption.trim()) throw new Error("CPU server returned an empty caption");
  return data.caption.trim().slice(0, 5000);
}

async function callProvider(provider: (typeof PROVIDERS)[number], systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env[provider.key];
  if (!apiKey) throw new Error(`${provider.name} API key is not configured`);
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: provider.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" }, temperature: 0.7, max_tokens: 900 }),
  });
  if (!response.ok) throw new Error(`${provider.name} ${response.status}`);
  const data = (await response.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${provider.name} returned an empty response`);
  return content;
}

function extractCaption(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { caption?: unknown };
    if (typeof parsed.caption === "string" && parsed.caption.trim()) return parsed.caption.trim().slice(0, 5000);
  } catch {}
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim().slice(0, 5000);
}

router.post("/ai/caption", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }
  const product = validateInput(req.body as ProductCaptionInput);
  if (!product) {
    res.status(400).json({ error: "Mahsulot nomi kiritilishi shart." });
    return;
  }

  if (process.env.CAPTION_CPU_URL?.trim()) {
    try {
      const caption = await callCpuServer(product);
      res.json({ caption });
      return;
    } catch (error) {
      console.warn("Product Caption AI: CPU server failed; using API fallback", error);
    }
  }

  const systemPrompt = `You are Product Caption AI for OneOffice AI.\nYour ONLY job is to write a professional, concise, sales-oriented product caption.\nUse ONLY the product data supplied by the user. Never invent specifications, materials, guarantees, discounts, delivery terms, certifications, availability, reviews, or other facts.\nIf information is missing, simply omit it.\nWrite naturally, not robotically. Match the requested language exactly when possible.\nDo not browse the web. Do not perform marketing strategy or analytics. Do not generate images or video. Do not modify any database.\nReturn ONLY valid JSON in this exact shape: {\"caption\":\"...\"}.`;
  const userPrompt = JSON.stringify({ product, language: product.language });
  let lastError: unknown;
  for (const provider of PROVIDERS) {
    if (!process.env[provider.key]) continue;
    try {
      const caption = extractCaption(await callProvider(provider, systemPrompt, userPrompt));
      if (caption) {
        res.json({ caption });
        return;
      }
    } catch (error) {
      lastError = error;
      console.warn(`Product Caption AI: ${provider.name} failed`, error);
    }
  }
  console.error("Product Caption AI failed on all configured providers", lastError);
  res.status(503).json({ error: "Caption AI hozir ishlamayapti. Birozdan so'ng qayta urinib ko'ring." });
});

export default router;
