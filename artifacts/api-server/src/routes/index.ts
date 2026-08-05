import { Router, type IRouter } from "express";
import healthRouter from "./health";
import connectRouter from "./connect";
import connectorsRouter from "./connectors";
import telegramWebhookRouter from "./telegramWebhook";
import instagramRouter from "./instagram";
import vkRouter from "./vk";
import storeRouter from "./store";
import publishRouter from "./publish";
import enrichRouter from "./enrich";
import productsRouter from "./products";
import youtubeRouter from "./youtube";

const router: IRouter = Router();

router.use(healthRouter);
router.use(connectRouter);
router.use(connectorsRouter);
router.use(telegramWebhookRouter);
router.use(instagramRouter);
router.use(vkRouter);
router.use(storeRouter);
router.use(publishRouter);
router.use(enrichRouter);
router.use(productsRouter);
router.use(youtubeRouter);

export default router;
