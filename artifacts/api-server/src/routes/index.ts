import { Router, type IRouter } from "express";
import healthRouter from "./health";
import connectRouter from "./connect";
import connectorsRouter from "./connectors";
import publishRouter from "./publish";
import enrichRouter from "./enrich";
import productsRouter from "./products";

const router: IRouter = Router();

router.use(healthRouter);
router.use(connectRouter);
router.use(connectorsRouter);
router.use(publishRouter);
router.use(enrichRouter);
router.use(productsRouter);

export default router;
