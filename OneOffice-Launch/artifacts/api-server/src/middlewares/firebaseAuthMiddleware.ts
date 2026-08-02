/**
 * Firebase Authentication middleware — replaces @clerk/express's
 * clerkMiddleware()/getAuth(req).
 *
 * Reads the `Authorization: Bearer <idToken>` header sent by the client
 * (see src/lib/auth-context.tsx on the frontend), verifies it against
 * Firebase, and exposes the signed-in user's uid the same way getAuth(req)
 * used to: `const { userId } = getAuth(req)`.
 *
 * Unlike Clerk, an invalid/missing token does NOT reject the request here —
 * routes decide for themselves whether auth is required (matching the
 * previous behavior in routes/connect.ts, which checks `if (!clerkUserId)`).
 */

import type { NextFunction, Request, Response } from "express";
import { firebaseAdminAuth } from "../lib/firebaseAdmin";

export interface FirebaseAuthState {
  userId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: FirebaseAuthState;
    }
  }
}

export async function firebaseAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.auth = { userId: null };

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const idToken = header.slice("Bearer ".length).trim();
    try {
      const decoded = await firebaseAdminAuth.verifyIdToken(idToken);
      req.auth = { userId: decoded.uid };
    } catch {
      // Invalid/expired token — leave req.auth.userId as null, same as
      // "signed out" from the route's perspective.
    }
  }

  next();
}

/**
 * Same shape as @clerk/express's getAuth(req), so route handlers barely
 * change: `const { userId } = getAuth(req);`
 */
export function getAuth(req: Request): FirebaseAuthState {
  return req.auth ?? { userId: null };
}
