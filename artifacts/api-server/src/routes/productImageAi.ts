import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { productsTable, usersTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

const POLLINATIONS_URL = "https://gen.pollinations.ai/v1/images/edits";
const MODEL = "openai/gpt-image-1.5";
const PROMPT = [
  "Create a professional e-commerce product photograph using the provided image as the exact product reference.",
  "Preserve the actual product identity, shape, proportions, colors, materials, branding, labels, text printed on the product, and all important physical details.",
  "Do not redesign, replace, add, remove, or invent product features.",
  "Remove the existing background and replace it with a seamless pure white #FFFFFF studio background.",
  "Use clean realistic studio lighting, sharp focus, natural soft contact shadow, centered composition, and a premium marketplace catalog look.",
  "Show only the product, with no extra objects, people, decorative props, captions, borders, logos, or watermark.",
].join(" ");

function getCurrentUserId(req: Parameters<typeof getAuth>[0]) {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) return null;
  return db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1)
    .then(([user]) => user?.id ?? null);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) throw new Error("Rasm formati noto'g'ri.");
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.length === 0) throw new Error("Rasm bo'sh.");
  if (bytes.length > 12 * 1024 * 1024) throw new Error("Rasm hajmi juda katta.");
  return new Blob([bytes], { type: mime });
}

router.post("/products/:id/generate-image", async (req, res) => {
  try {
    const apiKey = process.env.POL_IMAGE_AI_API;
    if (!apiKey) {
      res.status(503).json({ error: "AI image generator sozlanmagan." });
      return;
    }

    const userId = await getCurrentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }

    const productId = Number(req.params.id);
    if (!Number.isInteger(productId)) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }

    const [product] = await db
      .select({ id: productsTable.id, images: productsTable.images })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId)))
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Mahsulot topilmadi." });
      return;
    }

    const image = typeof req.body?.image === "string" ? req.body.image : "";
    if (!image.startsWith("data:image/")) {
      res.status(400).json({ error: "Mahsulot rasmi yuborilmadi." });
      return;
    }

    const form = new FormData();
    form.append("model", MODEL);
    form.append("prompt", PROMPT);
    form.append("image", dataUrlToBlob(image), "product-reference.png");
    form.append("response_format", "b64_json");

    const response = await fetch(POLLINATIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Pollinations image edit failed", response.status, text.slice(0, 1000));
      const status = response.status === 402 ? 402 : response.status === 401 ? 502 : 502;
      res.status(status).json({
        error:
          response.status === 402
            ? "AI image generator uchun balans yetarli emas."
            : "AI rasm yaratishda xatolik yuz berdi.",
      });
      return;
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const generated = payload.data?.[0];
    if (!generated) {
      res.status(502).json({ error: "AI bo'sh natija qaytardi." });
      return;
    }

    if (generated.b64_json) {
      res.json({ image: `data:image/png;base64,${generated.b64_json}` });
      return;
    }

    if (generated.url) {
      const media = await fetch(generated.url, { signal: AbortSignal.timeout(30_000) });
      if (!media.ok) throw new Error("AI natijasini yuklab bo'lmadi.");
      const contentType = media.headers.get("content-type") || "image/png";
      const buffer = Buffer.from(await media.arrayBuffer());
      if (buffer.length > 12 * 1024 * 1024) throw new Error("AI natijasi juda katta.");
      res.json({ image: `data:${contentType};base64,${buffer.toString("base64")}` });
      return;
    }

    res.status(502).json({ error: "AI natijasida rasm topilmadi." });
  } catch (error) {
    console.error("Product image generation failed", error);
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "AI rasm yaratish vaqti tugadi. Qayta urinib ko'ring."
      : "AI rasm yaratishda xatolik yuz berdi. Qayta urinib ko'ring.";
    res.status(502).json({ error: message });
  }
});

export default router;
