import { Router } from "express";
import { db } from "@workspace/db";
import { postsTable } from "@workspace/db/schema";
import { eq, desc, count, sql } from "drizzle-orm";
import { ListPostsQueryParams, GetUserStatsQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/posts", async (req, res) => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const { userId } = parsed.data;

  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.userId, userId))
    .orderBy(desc(postsTable.createdAt))
    .limit(50);

  const result = posts.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));

  res.json(result);
});

router.get("/stats", async (req, res) => {
  const parsed = GetUserStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const { userId } = parsed.data;

  const [totalRow] = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.userId, userId));

  const byStatus = await db
    .select({ status: postsTable.status, count: count() })
    .from(postsTable)
    .where(eq(postsTable.userId, userId))
    .groupBy(postsTable.status);

  const statusMap: Record<string, number> = {};
  for (const row of byStatus) {
    statusMap[row.status] = Number(row.count);
  }

  res.json({
    total: Number(totalRow?.count ?? 0),
    published: statusMap["Published"] ?? 0,
    pending: statusMap["Pending"] ?? 0,
    rejected: statusMap["Rejected"] ?? 0,
  });
});

export default router;
