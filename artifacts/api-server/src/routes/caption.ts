import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";

const router = Router();

type ProductCaptionInput = { product?: { name?: unknown; description?: unknown; category?: unknown; price?: unknown; features?: unknown }; language?: unknown };

function cleanString(value: unknown, maxLength: number): string { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function validateInput(body: ProductCaptionInput) {
  const raw = body?.product;
  if (!raw || typeof raw !== "object") return null;
  const name = cleanString(raw.name, 200);
  if (!name) return null;
  const features = Array.isArray(raw.features) ? raw.features.filter((f): f is string => typeof f === "string").map(f => f.trim().slice(0, 300)).filter(Boolean).slice(0, 20) : [];
  return { name, description: cleanString(raw.description, 2000), category: cleanString(raw.category, 200), price: cleanString(raw.price, 100), features, language: cleanString(body.language, 20) || "uz" };
}

async function callCpuServer(product: ReturnType<typeof validateInput>): Promise<string> {
  const baseUrl = process.env.CAPTION_CPU_URL?.trim().replace(/\/$/, "");
  if (!baseUrl || !product) throw new Error("CAPTION_CPU_URL is not configured");
  const response = await fetch(`${baseUrl}/caption`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ product: { name: product.name, description: product.description, category: product.category, price: product.price, features: product.features }, language: product.language }) });
  if (!response.ok) throw new Error(`CPU server ${response.status}`);
  const data = await response.json() as { caption?: unknown };
  if (typeof data.caption !== "string" || !data.caption.trim()) throw new Error("CPU server returned an empty caption");
  return data.caption.trim().slice(0, 5000);
}

router.post("/ai/caption", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Tizimga kirilmagan." }); return; }
  const product = validateInput(req.body as ProductCaptionInput);
  if (!product) { res.status(400).json({ error: "Mahsulot nomi kiritilishi shart." }); return; }

  try {
    const caption = await callCpuServer(product);
    console.log("[Caption AI] engine=cpu model=SmolLM2-135M-Instruct");
    res.json({ caption, engine: "cpu", model: "SmolLM2-135M-Instruct" });
  } catch (error) {
    console.error("Product Caption AI CPU server failed", error);
    res.status(503).json({ error: "Caption AI CPU server hozir ishlamayapti. Birozdan so'ng qayta urinib ko'ring." });
  }
});

export default router;
