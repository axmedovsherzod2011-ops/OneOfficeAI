import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { firebaseAuthMiddleware } from "./middlewares/firebaseAuthMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
// Raised from 15mb to fit several base64-encoded product photos in one
// request (New Product form supports multi-image select). The frontend
// also downsizes images client-side before sending, this is just headroom.
app.use(express.json({ limit: "40mb" }));
app.use(express.urlencoded({ extended: true, limit: "40mb" }));

// Verifies the Firebase ID token sent as `Authorization: Bearer <idToken>`
// and attaches req.auth so routes can read the signed-in Firebase user via
// getAuth(req) — same call shape routes/connect.ts already used for Clerk.
app.use(firebaseAuthMiddleware);

app.use("/api", router);

export default app;
