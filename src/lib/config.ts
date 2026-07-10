/**
 * Loon-configuratie op basis van de CAO Levensmiddelenbedrijf (LMB) — de CAO
 * voor franchise- en zelfstandige supermarkten (o.a. AH-franchise).
 *
 * De loontabel is per 1 januari 2026 en geverifieerd tegen echte loonstroken:
 * schaal C 19 jr = €10,49 en 20 jr = €11,79 (klopt op de cent). De toeslagen
 * (personeelstoeslag, ORT, vakantiegeld, ATV) gelden voor iedereen onder deze CAO.
 */

export type Schaal = "A" | "B" | "C";

export const SCHAAL_INFO: Record<Schaal, { voorbeeld: string }> = {
  A: { voorbeeld: "bijv. vakkenvuller" },
  B: { voorbeeld: "bijv. kassasluiter" },
  C: { voorbeeld: "bijv. teamleider" },
};

/** Eén loonschaal: jeugdloon per leeftijd + rij vanaf 21 jaar per functiejaar. */
export type Loonschaaltabel = { jeugd: Record<number, number>; vanaf21: number[] };

/**
 * Bruto uurloon per 1 januari 2026 (CAO LMB, Bijlage 2 Loonschalen).
 * - `jeugd`: uurloon op leeftijd 15 t/m 20 (jeugdloon; functiejaren tellen niet mee).
 * - `vanaf21`: uurloon vanaf 21 jaar, geïndexeerd op functiejaar (index 0 = startjaar).
 *   Schaal A kent maar één periodiek (fj 0 en 1 gelijk), B en C lopen door t/m fj 5.
 * Geverifieerd: schaal C 19 jr = €10,49 en 20 jr = €11,79 (loonstroken t/m mei 2026).
 */
const TABEL_2026_01: Record<Schaal, Loonschaaltabel> = {
  A: {
    jeugd: { 15: 4.67, 16: 5.38, 17: 6.16, 18: 7.26, 19: 8.71, 20: 11.61 },
    vanaf21: [14.51, 14.51],
  },
  B: {
    jeugd: { 16: 6.57, 17: 7.38, 18: 7.98, 19: 8.86, 20: 11.61 },
    vanaf21: [14.51, 15.50, 15.72, 15.94, 16.16, 16.60],
  },
  C: {
    jeugd: { 18: 9.48, 19: 10.49, 20: 11.79 },
    vanaf21: [14.73, 16.23, 16.50, 16.78, 17.05, 17.59],
  },
};

/**
 * Loontabel ná de CAO-verhoging medio 2026. Geverifieerd tegen de loonstrook van
 * verloningsperiode 7/2026 (run 08-07-2026, uren gewerkt in de AH-periode van
 * 18 mei – 14 jun): schaal C, 20 jr = **€11,99** (klopt op de cent).
 *
 * LET OP: alleen schaal C 20 jr is tegen een strook geverifieerd. De overige cellen
 * zijn (nog) overgenomen van 1-1-2026 en moeten bijgewerkt worden zodra de officiële
 * tabel ná de verhoging bekend is.
 */
const TABEL_2026_MID: Record<Schaal, Loonschaaltabel> = {
  A: { jeugd: { ...TABEL_2026_01.A.jeugd }, vanaf21: [...TABEL_2026_01.A.vanaf21] },
  B: { jeugd: { ...TABEL_2026_01.B.jeugd }, vanaf21: [...TABEL_2026_01.B.vanaf21] },
  C: { jeugd: { ...TABEL_2026_01.C.jeugd, 20: 11.99 }, vanaf21: [...TABEL_2026_01.C.vanaf21] },
};

export interface Loontabelversie {
  /** Geldig vanaf deze datum (ISO "YYYY-MM-DD"), t/m de dag vóór de volgende versie. */
  vanaf: string;
  tabel: Record<Schaal, Loonschaaltabel>;
}

/**
 * Loontabellen met ingangsdatum, oplopend gesorteerd. De engine kiest per dienst
 * de nieuwste tabel waarvan `vanaf` ≤ het einde van de 4-weken-periode.
 *
 * De exacte CAO-ingangsdatum van de verhoging is niet zeker; de strookjes leggen
 * hem alleen vast op ergens ná 17 mei (periode t/m 17 mei = €11,79) en uiterlijk
 * de periode 18 mei – 14 jun (= €11,99). We ankeren daarom op 18-05-2026; met de
 * periode-einde-lookup reproduceert dat beide strookjes exact.
 */
export const LOONTABELLEN: Loontabelversie[] = [
  { vanaf: "2026-01-01", tabel: TABEL_2026_01 },
  { vanaf: "2026-05-18", tabel: TABEL_2026_MID },
];

export const TOESLAGEN = {
  /**
   * Vaste personeelstoeslag per gewerkt uur — maar alleen t/m de AH-periode waarin
   * je 20 wordt (van je 16e af). Daarna vervalt hij. Zie `personeelstoeslagActief`
   * in pay.ts; geverifieerd: de strook met uren van ná die periode heeft €0 toeslag.
   */
  personeelstoeslagPerUur: 2.0,

  /** Zondag: +50% over basisloon (geldt ook voor zeldzame uren ná 22:00). */
  zondagPct: 0.5,
  /** Uren vanaf dit uur 's avonds krijgen ook +50% (los van zondag). */
  avondGrensUur: 22,
  avondPct: 0.5,

  /** Gewerkte feestdag: +100% over basisloon (dubbel betaald). Wint van zondag. */
  feestdagPct: 1.0,

  /** All-in opbouw, allemaal direct uitbetaald per periode. */
  vakantietoeslagPct: 0.08, // 8% over basisloon
  vakantiedagenPct: 0.101263, // ~10,1263% over basisloon (reproduceert beide strookjes exact)
  atvPct: 0.081, // 8,1% over (basisloon + personeelstoeslag)
} as const;

export const OVERIG = {
  /** Maaltijdvergoeding (netto/onbelast) bij een dienst met voldoende pauze. */
  maaltijdvergoeding: 4.05,
  maaltijdMinPauzeUur: 0.5, // benadering
} as const;
