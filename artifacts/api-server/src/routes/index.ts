import { Router, type IRouter } from "express";
import healthRouter from "./health";
import connectRouter from "./connect";
import connectorsRouter from "./connectors";
import publishRouter from "./publish";
import postsRouter from "./posts";
import enrichRouter from "./enrich";

const router: IRouter = Router();

router.use(healthRouter);
router.use(connectRouter);
router.use(connectorsRouter);
router.use(publishRouter);
router.use(postsRouter);
router.use(enrichRouter);

export default router;
