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

// Cloudflare Pages production + preview deployments both need to reach the
// Render API. Preview deployments use generated *.oneofficeai.pages.dev hosts.
// Reject every other origin.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      try {
        const url = new URL(origin);
        const allowed =
          url.protocol === "https:" &&
          (url.hostname === "oneofficeai.pages.dev" ||
            url.hostname.endsWith(".oneofficeai.pages.dev"));
        callback(null, allowed);
      } catch {
        callback(null, false);
      }
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    optionsSuccessStatus: 204,
    maxAge: 0,
  }),
);
// Raised from 15mb to fit several base64-encoded product photos in one
// request (New Product form supports multi-image select). The frontend
// also downsizes images client-side before sending, this is just headroom.
app.use(express.json({ limit: "40mb" }));
app.use(express.urlencoded({ extended: true, limit: "40mb" }));

// Google OAuth redirects to the backend root. Forward the complete OAuth
// query string to the production frontend, where the client-side callback
// validates state and exchanges the authorization code with the API.
app.get("/", (req, res) => {
  const frontendUrl = (process.env.FRONTEND_PUBLIC_URL ?? "https://oneofficeai.pages.dev").replace(/\/$/, "");
  res.redirect(302, `${frontendUrl}/${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
});

// The redirect URI used for Google's authorization-code exchange must be
// byte-for-byte identical to the URI used in the authorization request.
// Derive it from the backend's canonical PUBLIC_APP_URL instead of trusting
// a browser-provided value, preventing Cloudflare/local-origin/sessionStorage
// differences from causing a silent OAuth exchange failure.
app.use("/api/connectors/youtube/exchange", (req, _res, next) => {
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    const rawPublicUrl = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const publicUrl = rawPublicUrl
      ? rawPublicUrl.startsWith("http")
        ? rawPublicUrl
        : `https://${rawPublicUrl}`
      : "";
    if (publicUrl) {
      req.body.redirectUri = `${publicUrl}/`;
    }
  }
  next();
});

// Verifies the Firebase ID token sent as `Authorization: Bearer <idToken>`
// and attaches req.auth so routes can read the signed-in Firebase user via
// getAuth(req) — same call shape routes/connect.ts already used for Clerk.
app.use(firebaseAuthMiddleware);

app.use("/api", router);

export default app;
