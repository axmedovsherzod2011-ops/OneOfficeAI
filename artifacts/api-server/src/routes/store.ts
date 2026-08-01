import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, productsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40) || "do-kon"
  );
}

async function generateUniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let suffix = 0;
  // Small, bounded loop — collisions on a slug this specific are rare.
  while (suffix < 50) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.storeSlug, candidate))
      .limit(1);
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  return `${root}-${Date.now()}`;
}

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[store route]", err);
      res.status(500).json({
        error:
          "Serverda xatolik yuz berdi. Ma'lumotlar bazasi so'nggi o'zgarishlar bilan sinxron emas bo'lishi mumkin (pnpm run push kerak bo'lishi mumkin).",
      });
    }
  };
}

// ---------------------------------------------------------------------------
// GET /connectors/store/config — the signed-in user's storefront slug and
// full public URL. Generates a slug the first time this is called (lazy,
// so existing users don't need a migration/backfill).
// ---------------------------------------------------------------------------
router.get(
  "/connectors/store/config",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    let slug = user.storeSlug;
    if (!slug) {
      slug = await generateUniqueSlug(user.company || "do-kon");
      await db
        .update(usersTable)
        .set({ storeSlug: slug })
        .where(eq(usersTable.id, user.id));
    }

    res.json({ slug });
  }),
);

// ---------------------------------------------------------------------------
// GET /store/:slug — PUBLIC. No auth. Renders the storefront: the
// business name and every "active" product (drafts are never shown here).
// ---------------------------------------------------------------------------
router.get(
  "/store/:slug",
  handle(async (req, res) => {
    const slug = String(req.params.slug || "");
    if (!slug) {
      res.status(404).json({ error: "Do'kon topilmadi." });
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        company: usersTable.company,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(usersTable)
      .where(eq(usersTable.storeSlug, slug))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Do'kon topilmadi." });
      return;
    }

    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        category: productsTable.category,
        sellPrice: productsTable.sellPrice,
        currency: productsTable.currency,
        description: productsTable.description,
        images: productsTable.images,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.userId, user.id),
          eq(productsTable.status, "active"),
        ),
      );

    res.json({
      company: user.company,
      ownerName: `${user.firstName} ${user.lastName}`.trim(),
      products,
    });
  }),
);

export default router;
