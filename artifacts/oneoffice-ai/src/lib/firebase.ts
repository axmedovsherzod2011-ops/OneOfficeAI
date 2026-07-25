// ---------------------------------------------------------------------------
// Firebase Authentication — replaces Clerk as the identity provider for
// OneOffice AI. Supports email/password, Google, and Apple sign-in, matching
// the three methods that were enabled in the Firebase Console Auth pane.
// ---------------------------------------------------------------------------

import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";

// Your web app's Firebase configuration (from the Firebase Console).
// This is safe to ship in client code — it identifies the project, it is
// not a secret. Access is controlled by Firebase Auth + your security rules.
const firebaseConfig = {
  apiKey: "AIzaSyBnESMGkgj17bQNVXOD3f7W7u5noxNXipY",
  authDomain: "oneoffice-ai-011.firebaseapp.com",
  projectId: "oneoffice-ai-011",
  storageBucket: "oneoffice-ai-011.firebasestorage.app",
  messagingSenderId: "1092049548876",
  appId: "1:1092049548876:web:bbcadc5709024e16f526e9",
  measurementId: "G-6WZV87V56K",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider("apple.com");

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signInWithApple() {
  return signInWithPopup(auth, appleProvider);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser() {
  return signOut(auth);
}

export { onAuthStateChanged };
export type { User };
