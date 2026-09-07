import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// Express exposes req.query as a read-only getter in the current runtime.
// When a client reaches preview without productId, recover the same product
// recorded by the metadata/director plan, then rewrite req.url so Express
// reparses the query for the actual preview handler.
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

    const parsedUrl = new URL(req.originalUrl || req.url, "http://localhost");
    parsedUrl.searchParams.set("productId", String(productId));
    req.url = `${parsedUrl.pathname}${parsedUrl.search}`;
    return next();
  } catch (error) {
    console.warn("[youtube preview compat] could not recover product id:", error);
    return next();
  }
});

export default router;
