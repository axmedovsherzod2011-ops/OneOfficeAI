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
import productResearchRouter from "./productResearch";
import youtubeRouter from "./youtube";
import youtubeStatisticsRouter from "./youtubeStatistics";
import telegramMtprotoRouter from "./telegramMtproto";
import statsDashboardRouter from "./statsDashboard";
import ordersRouter from "./orders";
import onehelpRouter from "./onehelp";
import externalAgentRouter from "./externalAgent";
import captionRouter from "./caption";
import { telegramCodeRateLimit } from "../middlewares/telegramCodeRateLimit";

const router: IRouter = Router();

router.get("/", (req, res) => {
  const frontendUrl = process.env.FRONTEND_PUBLIC_URL ?? "https://oneofficeai.pages.dev";
  res.redirect(302, `${frontendUrl.replace(/\/$/, "")}${req.originalUrl}`);
});

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
router.use(productResearchRouter);
router.use(youtubeRouter);
router.use(youtubeStatisticsRouter);
router.use(telegramCodeRateLimit);
router.use(telegramMtprotoRouter);
router.use(statsDashboardRouter);
router.use(ordersRouter);
router.use(onehelpRouter);
router.use(externalAgentRouter);
router.use(captionRouter);

export default router;
