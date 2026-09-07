import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// Some production clients can arrive at the preview endpoint without the
// query string even though the metadata request immediately before it had a
// valid product id. Metadata generation records the exact product + format in
// youtube_video_director_plans, so recover that same product here instead of
// making the user hit a generic "Failed to fetch" error.
router.get("/connectors/youtube/preview", async (req: any, res: any, next: any) => {
  try {
    const rawProductId = req.query?.productId;
    const numericProductId = Number(rawProductId);
    if (Number.isFinite(numericProductId)) {
      return next();
    }

    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) return next();

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);
    if (!user) return next();

    const isShort = String(req.query?.isShort ?? "false") === "true";

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

    req.query = { ...req.query, productId: String(productId) };
    return next();
  } catch (error) {
    console.warn("[youtube preview compat] could not recover product id:", error);
    return next();
  }
});

export default router;
