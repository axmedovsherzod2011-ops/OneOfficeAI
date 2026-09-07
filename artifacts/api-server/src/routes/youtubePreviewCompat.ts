import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// Some clients can reach preview without a usable productId. Resolve the
// product from the latest director plan and override Express's prototype
// getter with an own query object. This keeps the request in-process and
// avoids a 307 redirect, which can surface to cross-origin fetch() as
// "Failed to fetch" before the actual preview handler is reached.
router.get("/connectors/youtube/preview", async (req: any, res: any, next: any) => {
  try {
    const currentQuery = req.query ?? {};
    const rawProductId = currentQuery.productId;
    const numericProductId = Number(rawProductId);
    if (Number.isFinite(numericProductId)) return next();

    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) return next();

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);
    if (!user) return next();

    const isShort = String(currentQuery.isShort ?? "false") === "true";
    const result = await db.execute(sql`
      SELECT product_id
      FROM youtube_video_director_plans
      WHERE user_id = ${user.id}
        AND is_short = ${isShort}
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const row = (result as any)?.rows?.[0];
    const productId = Number(row?.product_id);
    if (!Number.isFinite(productId)) return next();

    Object.defineProperty(req, "query", {
      value: { ...currentQuery, productId: String(productId) },
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return next();
  } catch (error) {
    console.warn("[youtube preview compat] could not recover product id:", error);
    return next();
  }
});

export default router;
