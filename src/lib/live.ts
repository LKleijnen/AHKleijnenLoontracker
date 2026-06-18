/**
 * Live-loon tijdens een lopende dienst: hoeveel je op dít moment al verdiend
 * hebt, continu oplopend "op de cent". Bouwt voort op dezelfde reken-engine als
 * de rest van de app, zodat het eindbedrag exact op het dienst-bruto uitkomt.
 *
 * Aanpak: we maken een "deel-dienst" van de start tot nu (met de pauze
 * evenredig verdeeld) en rekenen daar het bruto over. Zo lopen de
 * onregelmatigheidstoeslagen vanzelf mee — de teller versnelt bijvoorbeeld
 * zichtbaar zodra het na 22:00 avondtoeslag wordt.
 */
import { brutoRuw, componentenVoorDienst, gewerkteUrenVan, loonVoorDienst } from "./pay";
import type { Dienst, Loongegevens } from "./types";

export interface LiveLoon {
  afdeling: string;
  start: Date;
  eind: Date;
  /** Vloeiend, onafgerond opgebouwd bruto tot nu (voor de streamende teller). */
  brutoNu: number;
  /** Officieel afgerond bruto van de héle dienst (verwacht eindbedrag). */
  brutoTotaal: number;
  /** Aandeel van het dienst-bruto dat al verdiend is, 0–100. */
  pct: number;
  /** Gemiddeld all-in tarief over deze dienst (incl. alle toeslagen). */
  perUur: number;
  /** Gewerkte uren van de hele dienst (klok minus pauze). */
  gewerkteUren: number;
  /** Resterende klok-tijd tot het einde van de dienst, in ms. */
  resterendMs: number;
  /** Maaltijdvergoeding (netto, los van bruto) die de dienst oplevert. */
  maaltijd: number;
  /** "Zondag" / feestdagnaam, of undefined bij een gewone dienst. */
  badge?: string;
}

/** De dienst die op `nu` bezig is (start ≤ nu < eind), of null. */
export function actieveDienst(diensten: Dienst[], nu: Date): Dienst | null {
  const t = nu.getTime();
  let actief: Dienst | null = null;
  for (const d of diensten) {
    if (d.start.getTime() <= t && t < d.eind.getTime()) {
      // Bij (theoretische) overlap: de laatst begonnen dienst wint.
      if (!actief || d.start.getTime() > actief.start.getTime()) actief = d;
    }
  }
  return actief;
}

/** Live-loon voor een lopende dienst op tijdstip `nu`. */
export function liveLoon(dienst: Dienst, loon: Loongegevens, nu: Date): LiveLoon {
  const startMs = dienst.start.getTime();
  const eindMs = dienst.eind.getTime();
  const totaalClock = Math.max(1, eindMs - startMs);
  const t = Math.min(Math.max(nu.getTime(), startMs), eindMs);
  const f = (t - startMs) / totaalClock; // aandeel klok-tijd verstreken

  const vol = loonVoorDienst(dienst, loon);
  const brutoTotaalRuw = brutoRuw(componentenVoorDienst(dienst, loon));

  // Deel-dienst tot nu; pauze evenredig verdeeld zodat de uren netjes meelopen.
  const deel: Dienst = { ...dienst, eind: new Date(t), pauzeUur: dienst.pauzeUur * f };
  const brutoNu = brutoRuw(componentenVoorDienst(deel, loon));

  const gewerkteUren = gewerkteUrenVan(dienst);
  const badge = vol.isFeestdag ? vol.feestdagNaam : vol.isZondag ? "Zondag" : undefined;

  return {
    afdeling: dienst.afdeling,
    start: dienst.start,
    eind: dienst.eind,
    brutoNu,
    brutoTotaal: vol.bruto,
    pct: brutoTotaalRuw > 0 ? Math.min(100, (brutoNu / brutoTotaalRuw) * 100) : 0,
    perUur: gewerkteUren > 0 ? brutoTotaalRuw / gewerkteUren : 0,
    gewerkteUren,
    resterendMs: Math.max(0, eindMs - nu.getTime()),
    maaltijd: vol.maaltijdvergoeding,
    badge,
  };
}
