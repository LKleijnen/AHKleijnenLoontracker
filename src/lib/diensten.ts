/**
 * Heen-en-weer tussen een `Dienst` (met `Date`-velden) en een `RuweDienst`
 * (opslagbare naïeve wandkloktijd). Cruciaal: serialiseren gebruikt de lokale
 * getters en herleven de lokale `Date`-constructor — net als de iCal-parser —
 * zodat het uur (`getHours()`) na opslaan/herladen in elke tijdzone gelijk
 * blijft. Géén `toISOString()`, want dat zou het uur verschuiven.
 */
import type { Dienst, RuweDienst } from "./types";

const p2 = (n: number) => String(n).padStart(2, "0");

function naarWandklok(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function uitWandklok(s: string): Date {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

export function naarRuw(d: Dienst): RuweDienst {
  return {
    uid: d.uid,
    start: naarWandklok(d.start),
    eind: naarWandklok(d.eind),
    pauzeUur: d.pauzeUur,
    afdeling: d.afdeling,
    bron: d.bron,
  };
}

export function naarDienst(r: RuweDienst): Dienst {
  return {
    uid: r.uid,
    start: uitWandklok(r.start),
    eind: uitWandklok(r.eind),
    pauzeUur: r.pauzeUur,
    afdeling: r.afdeling,
    bron: r.bron,
  };
}

/** Is deze dienst al geweest (eindtijd in het verleden)? */
export function isVoorbij(r: RuweDienst, nu: Date = new Date()): boolean {
  return uitWandklok(r.eind).getTime() <= nu.getTime();
}

/** Overlapt deze dienst qua tijd met één van de bestaande diensten? */
export function overlapt(nieuw: Dienst, bestaande: Dienst[]): boolean {
  const ns = nieuw.start.getTime();
  const ne = nieuw.eind.getTime();
  return bestaande.some((d) => d.start.getTime() < ne && ns < d.eind.getTime());
}
