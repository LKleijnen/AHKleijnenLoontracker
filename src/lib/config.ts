/**
 * Loon-configuratie afgeleid uit de loonstroken (periode 7: €10,49 / 19 jr,
 * periode 8: €11,79 / 20 jr). Alle waarden kloppen tot op de cent.
 */

export const PROFILE = {
  geboortedatum: { jaar: 2006, maand: 5, dag: 16 }, // 16 mei 2006
};

/** Bruto uurloon per leeftijd (schaal C, CAO Levensmiddelenbedrijf). */
export const UURLOON_PER_LEEFTIJD: Record<number, number> = {
  19: 10.49,
  20: 11.79,
  // 21+ nog niet bekend
};

export const TOESLAGEN = {
  /** Vaste personeelstoeslag per gewerkt uur. */
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
