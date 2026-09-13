import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();
const POLLINATIONS_URL = "https://gen.pollinations.ai/v1/images/edits";
const MODEL = "openai/gpt-image-1.5";
const PROMPT = "Create a professional e-commerce product photograph from the provided reference. Preserve the exact product identity, shape, proportions, colors, materials, branding, labels, printed text and important physical details. Do not redesign or invent product features. Replace the background with a seamless pure white #FFFFFF studio background. Use realistic studio lighting, sharp focus, a natural soft contact shadow, centered composition and a premium marketplace catalog look. Show only the product, with no extra objects, people, decorative props, captions, borders, logos or watermark.";

async function getCurrentUserId(req: Parameters<typeof getAuth>[0]) {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) return null;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
  return user?.id ?? null;
}

function toBlob(dataUrl: string): Blob {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) throw new Error("Invalid image format");
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error("Image size is invalid");
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

router.post("/products/generate-image", async (req, res) => {
  try {
    const key = process.env.POL_IMAGE_AI_API;
    if (!key) return void res.status(503).json({ error: "AI image generator sozlanmagan." });
    if (!(await getCurrentUserId(req))) return void res.status(401).json({ error: "Tizimga kirilmagan." });

    const image = typeof req.body?.image === "string" ? req.body.image : "";
    if (!image.startsWith("data:image/")) return void res.status(400).json({ error: "Mahsulot rasmi yuborilmadi." });

    const form = new FormData();
    form.append("model", MODEL);
    form.append("prompt", PROMPT);
    form.append("image", toBlob(image), "product-reference.png");
    form.append("response_format", "b64_json");

    const response = await fetch(POLLINATIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Pollinations image edit failed", response.status, text.slice(0, 1000));
      return void res.status(response.status === 402 ? 402 : 502).json({
        error: response.status === 402 ? "AI image generator uchun balans yetarli emas." : "AI rasm yaratishda xatolik yuz berdi.",
      });
    }

    const payload = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const result = payload.data?.[0];
    if (!result) return void res.status(502).json({ error: "AI bo'sh natija qaytardi." });

    if (result.b64_json) return void res.json({ image: `data:image/png;base64,${result.b64_json}` });

    if (result.url) {
      const media = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
      if (!media.ok) throw new Error("Generated media could not be fetched");
      const type = media.headers.get("content-type") || "image/png";
      const bytes = Buffer.from(await media.arrayBuffer());
      if (bytes.length > 12 * 1024 * 1024) throw new Error("Generated image is too large");
      return void res.json({ image: `data:${type};base64,${bytes.toString("base64")}` });
    }

    return void res.status(502).json({ error: "AI natijasida rasm topilmadi." });
  } catch (error) {
    console.error("Product image generation failed", error);
    return void res.status(502).json({ error: "AI rasm yaratishda xatolik yuz berdi. Qayta urinib ko'ring." });
  }
});

export default router;
