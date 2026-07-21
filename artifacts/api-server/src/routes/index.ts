import { Router, type IRouter } from "express";
import healthRouter from "./health";
import connectRouter from "./connect";
import publishRouter from "./publish";
import postsRouter from "./posts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(connectRouter);
router.use(publishRouter);
router.use(postsRouter);

export default router;
