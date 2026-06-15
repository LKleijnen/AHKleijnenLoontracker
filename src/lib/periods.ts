/**
 * AH 4-weken periodekalender (13 periodes/jaar, 28 dagen elk).
 * Anker: periode 1 van 2026 start maandag 29-12-2025.
 * Uitbetaling: uren van periode N worden betaald aan het EIND van periode N+1.
 */

const ANKER_MS = Date.UTC(2025, 11, 29); // ma 29-12-2025 = start P1-2026
const PERIODE_MS = 28 * 24 * 60 * 60 * 1000;

export interface Periode {
  index: number; // doorlopende index vanaf het anker (kan negatief)
  jaar: number; // AH-jaar
  nummer: number; // 1..13 binnen dat jaar
  start: Date; // 00:00 lokaal (eerste dag)
  eind: Date; // laatste dag (inclusief)
  paydatum: Date; // einddatum van periode index+1
}

function dagMs(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function periodeIndexVoor(datum: Date): number {
  return Math.floor((dagMs(datum) - ANKER_MS) / PERIODE_MS);
}

function startVan(index: number): Date {
  const ms = ANKER_MS + index * PERIODE_MS;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function eindVan(index: number): Date {
  const ms = ANKER_MS + index * PERIODE_MS + 27 * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function periode(index: number): Periode {
  const jaar = 2026 + Math.floor(index / 13);
  const nummer = ((index % 13) + 13) % 13 + 1;
  return {
    index,
    jaar,
    nummer,
    start: startVan(index),
    eind: eindVan(index),
    paydatum: eindVan(index + 1),
  };
}

export function huidigePeriode(nu: Date = new Date()): Periode {
  return periode(periodeIndexVoor(nu));
}

/** Valt een dienst-datum binnen een periode (inclusief grenzen)? */
export function inPeriode(datum: Date, p: Periode): boolean {
  const t = dagMs(datum);
  return t >= dagMs(p.start) && t <= dagMs(p.eind);
}
