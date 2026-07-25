/**
 * Firebase Admin SDK — used server-side only, to verify the Firebase ID
 * token the client sends as `Authorization: Bearer <idToken>`.
 *
 * Credentials: set the FIREBASE_SERVICE_ACCOUNT env var to the full JSON
 * contents of a service account key (Firebase Console → Project settings →
 * Service accounts → Generate new private key). Paste the whole JSON as a
 * single-line string into the Secrets pane.
 *
 * Alternatively, if GOOGLE_APPLICATION_CREDENTIALS / the platform already
 * provides Application Default Credentials, FIREBASE_SERVICE_ACCOUNT can be
 * left unset and applicationDefault() will be used instead.
 */

import {
  initializeApp,
  cert,
  applicationDefault,
  getApps,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function buildFirebaseAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  // Falls back to Application Default Credentials if no explicit key is
  // configured (works out of the box on some hosting providers).
  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const firebaseAdminApp = buildFirebaseAdminApp();
export const firebaseAdminAuth = getAuth(firebaseAdminApp);
