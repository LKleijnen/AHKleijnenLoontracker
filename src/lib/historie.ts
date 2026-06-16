/**
 * Opslag van voorbije diensten ("roosters die al geweest zijn").
 *
 * De rooster-iCal bevat maar ~4 weken, dus diensten verdwijnen al uit de bron
 * vóórdat een hele 4-weken-periode compleet is. Daarom bewaren we elke dienst
 * los zodra hij voorbij is (niet pas als de periode klaar is):
 *   - zonder account → in localStorage (alleen dit apparaat);
 *   - met account    → in Firestore onder de uid (gesynct over apparaten).
 *
 * We bewaren alleen de **ruwe** dienst (uid, begin/eind als wandkloktijd, pauze,
 * afdeling) — géén berekend loon. Het loon wordt bij het tonen opnieuw berekend
 * (`bouwOverzicht`), zodat de historie automatisch meebeweegt als je je schaal
 * of geboortedatum corrigeert.
 */
import { collection, deleteDoc, doc, getDocs, writeBatch } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { isVoorbij } from "./diensten";
import type { RuweDienst } from "./types";

const LOKAAL_KEY = "loon_diensten";
const BATCH_MAX = 450; // Firestore writeBatch-limiet is 500; ruime marge

/** Alleen de diensten die al geweest zijn, uit een lijst ruwe diensten. */
export function voorbijeDiensten(diensten: RuweDienst[]): RuweDienst[] {
  return diensten.filter((d) => isVoorbij(d));
}

/** Voegt diensten-lijsten samen op uid; latere lijsten winnen (verser). */
export function voegSamen(...lijsten: RuweDienst[][]): RuweDienst[] {
  const map = new Map<string, RuweDienst>();
  for (const lijst of lijsten) for (const d of lijst) map.set(d.uid, d);
  return [...map.values()];
}

/* ---------- localStorage ---------- */

export function laadLokaal(): RuweDienst[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOKAAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RuweDienst[];
    return Array.isArray(arr) ? arr.filter((d) => d && typeof d.uid === "string" && typeof d.start === "string") : [];
  } catch {
    return [];
  }
}

export function bewaarLokaal(diensten: RuweDienst[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOKAAL_KEY, JSON.stringify(diensten));
  } catch {
    /* quota vol o.i.d. — negeren, het is maar een cache */
  }
}

/* ---------- Firestore ---------- */

/** iCal-uids kunnen tekens als '/' bevatten; maak er een geldige doc-id van. */
function veiligeDocId(uid: string): string {
  return encodeURIComponent(uid).slice(0, 1400) || "_";
}

export async function laadCloud(uid: string): Promise<RuweDienst[]> {
  const fb = getFirebase();
  if (!fb) return [];
  const snap = await getDocs(collection(fb.db, "gebruikers", uid, "diensten"));
  const out: RuweDienst[] = [];
  snap.forEach((d) => {
    const data = d.data() as { json?: string };
    if (typeof data.json !== "string") return;
    try {
      const r = JSON.parse(data.json) as RuweDienst;
      // Negeer documenten in een ouder formaat (zonder ruwe wandkloktijden).
      if (r && typeof r.uid === "string" && typeof r.start === "string" && typeof r.eind === "string") {
        out.push(r);
      }
    } catch {
      /* corrupt document — overslaan */
    }
  });
  return out;
}

export async function bewaarCloud(uid: string, diensten: RuweDienst[]): Promise<void> {
  const fb = getFirebase();
  if (!fb || diensten.length === 0) return;
  for (let i = 0; i < diensten.length; i += BATCH_MAX) {
    const batch = writeBatch(fb.db);
    for (const d of diensten.slice(i, i + BATCH_MAX)) {
      const ref = doc(fb.db, "gebruikers", uid, "diensten", veiligeDocId(d.uid));
      batch.set(ref, { uid: d.uid, json: JSON.stringify(d), bijgewerkt: Date.now() });
    }
    await batch.commit();
  }
}

export async function verwijderCloud(uid: string, dienstUid: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await deleteDoc(doc(fb.db, "gebruikers", uid, "diensten", veiligeDocId(dienstUid)));
}

/* ---------- Orkestratie ---------- */

export interface SyncResultaat {
  /** Alle bekende voorbije diensten (lokaal + cloud + verse), gededupliceerd. */
  diensten: RuweDienst[];
  /** Gezet als opslaan/lezen in de cloud mislukte (bv. ontbrekende rules). */
  cloudFout?: string;
}

/**
 * Snapshot de zojuist voorbije diensten en geef alle bekende voorbije diensten
 * terug. De aanroeper voegt die samen met de live diensten en berekent het loon.
 *
 * - Zonder `uid`: alleen localStorage.
 * - Met `uid`: Firestore is leidend, maar bestaande lokale diensten worden
 *   eenmalig mee omhoog gemigreerd, en alles wordt offline in localStorage
 *   gespiegeld. Schrijven gebeurt best-effort; faalt de cloud, dan blijft de UI
 *   werken op lokale/in-memory data en geeft `cloudFout` de reden terug.
 */
export async function syncHistorie(
  liveDiensten: RuweDienst[],
  uid: string | null,
): Promise<SyncResultaat> {
  const vers = voorbijeDiensten(liveDiensten);
  const lokaal = laadLokaal();

  if (!uid) {
    const diensten = voegSamen(lokaal, vers);
    bewaarLokaal(diensten);
    return { diensten };
  }

  let cloud: RuweDienst[];
  try {
    cloud = await laadCloud(uid);
  } catch (e: any) {
    const diensten = voegSamen(lokaal, vers);
    bewaarLokaal(diensten);
    return { diensten, cloudFout: e?.message || "Cloud onbereikbaar" };
  }

  // Volgorde bepaalt wie wint bij gelijke uid: vers > cloud > lokaal.
  const diensten = voegSamen(lokaal, cloud, vers);

  // Schrijf alleen wat nieuw of gewijzigd is t.o.v. de cloud (scheelt writes).
  const cloudJson = new Map(cloud.map((d) => [d.uid, JSON.stringify(d)]));
  const teSchrijven = diensten.filter((d) => cloudJson.get(d.uid) !== JSON.stringify(d));
  let cloudFout: string | undefined;
  if (teSchrijven.length) {
    try {
      await bewaarCloud(uid, teSchrijven);
    } catch (e: any) {
      cloudFout = e?.message || "Opslaan in cloud mislukt";
    }
  }

  bewaarLokaal(diensten); // offline-kopie
  return { diensten, cloudFout };
}
