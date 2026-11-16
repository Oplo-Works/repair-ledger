import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
};

export const configMissing = !cfg.apiKey || !cfg.projectId || !cfg.appId;
export const CLOUD_MODEL = (import.meta.env.VITE_CLOUD_MODEL as string | undefined) || "gemini-3.8-flash";

let app: FirebaseApp | null = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;
export let appCheckConfigured = false;

if (!configMissing) {
  app = initializeApp(cfg);
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  // Debug provider ONLY on localhost with explicit local env opt-in. Token is never committed.
  if (location.hostname === "localhost" && import.meta.env.VITE_APPCHECK_DEBUG === "true") {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if (siteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    appCheckConfigured = true;
  }
  auth = getAuth(app);
  // Single save path: Firestore offline persistence (IndexedDB). No custom sync engine / service worker.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}

export function getApp(): FirebaseApp {
  if (!app) throw new Error("Firebase config missing (.env.local). See .env.example.");
  return app;
}

export async function ensureAnonUid(): Promise<string> {
  if (!auth) throw new Error("Firebase config missing (.env.local).");
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser!.uid;
}
