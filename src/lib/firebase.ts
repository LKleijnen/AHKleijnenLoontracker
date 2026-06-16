/**
 * Firebase-initialisatie voor de optionele account-functie.
 *
 * Het hele "bewaar je geschiedenis in de cloud"-deel is optioneel: als er geen
 * Firebase-config in de env-vars staat, is `firebaseGeconfigureerd` false en
 * gedraagt de app zich exact zoals voorheen (alleen localStorage). De UI
 * verbergt de account-knoppen dan volledig.
 *
 * De config staat in `NEXT_PUBLIC_*` env-vars. Dat is hier prima: de Firebase
 * web-config is géén geheim (hij staat sowieso in de client-bundel). De échte
 * beveiliging zit in de Firestore-rules (zie firestore.rules): een gebruiker
 * mag alleen bij zijn eigen documenten.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Is de account-functie beschikbaar? Alleen als de essentiële keys gezet zijn. */
export const firebaseGeconfigureerd = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

/**
 * Lazy initialisatie. Geeft `null` als Firebase niet geconfigureerd is, zodat
 * de rest van de app daar netjes op kan reageren zonder te crashen.
 */
export function getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (!firebaseGeconfigureerd) return null;
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
  }
  return { app, auth: authInstance!, db: dbInstance! };
}
