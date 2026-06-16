/**
 * Bewaart en laadt de gebruikersinstellingen (geboortedatum, schaal,
 * functiejaren, iCal-link) in Firestore, op het profiel-document
 * `gebruikers/{uid}`. Zo kun je na inloggen op elk apparaat je gegevens
 * ophalen zonder de onboarding opnieuw te doorlopen.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebase } from "./firebase";
import type { Instellingen } from "./types";

function geldig(inst: unknown): inst is Instellingen {
  const i = inst as Instellingen | undefined;
  return !!i && !!i.icalUrl && !!i.geboortedatum && !!i.schaal;
}

export async function laadInstellingenCloud(uid: string): Promise<Instellingen | null> {
  const fb = getFirebase();
  if (!fb) return null;
  const snap = await getDoc(doc(fb.db, "gebruikers", uid));
  const data = snap.data() as { instellingen?: Instellingen } | undefined;
  return geldig(data?.instellingen) ? data!.instellingen! : null;
}

export async function bewaarInstellingenCloud(uid: string, inst: Instellingen): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  // merge: laat de diensten-subcollectie en andere velden ongemoeid.
  await setDoc(doc(fb.db, "gebruikers", uid), { instellingen: inst, bijgewerkt: Date.now() }, { merge: true });
}
