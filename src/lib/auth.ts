/**
 * React-hook rond Firebase Authentication voor de optionele account-functie.
 *
 * Eén `useFirebaseAuth()` in de pagina geeft de inlogstatus + acties (Google,
 * e-mail/wachtwoord). Als Firebase niet geconfigureerd is, is `beschikbaar`
 * false en doen de acties niets — de UI verbergt de account-knoppen dan.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebase, firebaseGeconfigureerd } from "./firebase";

export interface FirebaseAuth {
  /** Is de account-functie überhaupt beschikbaar (Firebase geconfigureerd)? */
  beschikbaar: boolean;
  /** De ingelogde gebruiker, of null. */
  gebruiker: User | null;
  /** True totdat de eerste auth-status binnen is. */
  laden: boolean;
  inloggenGoogle: () => Promise<void>;
  inloggenEmail: (email: string, wachtwoord: string) => Promise<void>;
  registrerenEmail: (email: string, wachtwoord: string) => Promise<void>;
  uitloggen: () => Promise<void>;
}

/** Vertaalt Firebase-foutcodes naar begrijpelijke Nederlandse meldingen. */
function nlFout(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? "";
  const meldingen: Record<string, string> = {
    "auth/invalid-email": "Dat is geen geldig e-mailadres.",
    "auth/missing-password": "Vul een wachtwoord in.",
    "auth/weak-password": "Kies een wachtwoord van minstens 6 tekens.",
    "auth/email-already-in-use": "Er bestaat al een account met dit e-mailadres. Log in.",
    "auth/invalid-credential": "E-mailadres of wachtwoord klopt niet.",
    "auth/wrong-password": "E-mailadres of wachtwoord klopt niet.",
    "auth/user-not-found": "Er bestaat nog geen account met dit e-mailadres.",
    "auth/too-many-requests": "Te veel pogingen. Probeer het later opnieuw.",
    "auth/popup-closed-by-user": "Inloggen geannuleerd.",
    "auth/popup-blocked": "De pop-up werd geblokkeerd. Sta pop-ups toe en probeer opnieuw.",
    "auth/network-request-failed": "Geen verbinding. Controleer je internet.",
  };
  return new Error(meldingen[code] ?? "Er ging iets mis bij het inloggen.");
}

export function useFirebaseAuth(): FirebaseAuth {
  const [gebruiker, setGebruiker] = useState<User | null>(null);
  const [laden, setLaden] = useState(firebaseGeconfigureerd);

  useEffect(() => {
    const fb = getFirebase();
    if (!fb) {
      setLaden(false);
      return;
    }
    return onAuthStateChanged(fb.auth, (u) => {
      setGebruiker(u);
      setLaden(false);
    });
  }, []);

  const inloggenGoogle = useCallback(async () => {
    const fb = getFirebase();
    if (!fb) return;
    try {
      await signInWithPopup(fb.auth, new GoogleAuthProvider());
    } catch (e) {
      throw nlFout(e);
    }
  }, []);

  const inloggenEmail = useCallback(async (email: string, wachtwoord: string) => {
    const fb = getFirebase();
    if (!fb) return;
    try {
      await signInWithEmailAndPassword(fb.auth, email.trim(), wachtwoord);
    } catch (e) {
      throw nlFout(e);
    }
  }, []);

  const registrerenEmail = useCallback(async (email: string, wachtwoord: string) => {
    const fb = getFirebase();
    if (!fb) return;
    try {
      await createUserWithEmailAndPassword(fb.auth, email.trim(), wachtwoord);
    } catch (e) {
      throw nlFout(e);
    }
  }, []);

  const uitloggen = useCallback(async () => {
    const fb = getFirebase();
    if (!fb) return;
    await firebaseSignOut(fb.auth);
  }, []);

  return {
    beschikbaar: firebaseGeconfigureerd,
    gebruiker,
    laden,
    inloggenGoogle,
    inloggenEmail,
    registrerenEmail,
    uitloggen,
  };
}
