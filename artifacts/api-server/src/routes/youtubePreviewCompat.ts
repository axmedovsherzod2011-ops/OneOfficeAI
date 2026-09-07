import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// Some clients can reach preview without a usable productId. Do not mutate
// Express req.query (it is a read-only getter in the current runtime). Resolve
// the product from the latest director plan and issue a 307 redirect instead.
// fetch() follows the redirect automatically, preserving the Authorization
// header and causing Express to parse the new query string normally.
router.get("/connectors/youtube/preview", async (req: any, res: any, next: any) => {
  try {
    const rawProductId = req.query?.productId;
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

    const parsedUrl = new URL(req.originalUrl || req.url, "http://localhost");
    parsedUrl.searchParams.set("productId", String(productId));
    return res.redirect(307, `${parsedUrl.pathname}${parsedUrl.search}`);
  } catch (error) {
    console.warn("[youtube preview compat] could not recover product id:", error);
    return next();
  }
});

export default router;
