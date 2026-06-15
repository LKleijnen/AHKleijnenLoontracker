/**
 * Reken-engine: zet uren + uurloon om in bruto-loon met volledige opbouw.
 * Reproduceert de loonstroken exact (zie scripts/validate.ts).
 */
import { LOONTABEL_2026, TOESLAGEN, OVERIG } from "./config";
import { feestdagNaam } from "./holidays";
import type { Dienst, DienstLoon, LoonRegel, BrutoInvoer, Geboortedatum, Loongegevens } from "./types";

const MS_UUR = 3600000;

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function leeftijdOp(datum: Date, geboortedatum: Geboortedatum): number {
  const { jaar, maand, dag } = geboortedatum;
  let leeftijd = datum.getFullYear() - jaar;
  const voorVerjaardag =
    datum.getMonth() + 1 < maand ||
    (datum.getMonth() + 1 === maand && datum.getDate() < dag);
  if (voorVerjaardag) leeftijd--;
  return leeftijd;
}

/**
 * Uurloon op een datum volgens de CAO-tabel, op basis van schaal, leeftijd en
 * functiejaren. Onder 21 telt de leeftijd (jeugdloon, functiejaren genegeerd);
 * vanaf 21 telt het functiejaar. Valt terug op de dichtstbijzijnde bekende
 * jeugdleeftijd binnen de schaal als een leeftijd niet in de tabel staat.
 */
export function uurloonVoorDatum(datum: Date, loon: Loongegevens): number {
  const tabel = LOONTABEL_2026[loon.schaal];
  const leeftijd = leeftijdOp(datum, loon.geboortedatum);

  if (leeftijd >= 21) {
    const fj = Math.max(0, Math.min(Math.floor(loon.functiejaren), tabel.vanaf21.length - 1));
    return tabel.vanaf21[fj];
  }

  if (tabel.jeugd[leeftijd] != null) return tabel.jeugd[leeftijd];
  // Onbekende (te jonge) leeftijd voor deze schaal: pak het dichtstbijzijnde tarief.
  const leeftijden = Object.keys(tabel.jeugd).map(Number).sort((a, b) => a - b);
  const lager = leeftijden.filter((l) => l <= leeftijd);
  if (lager.length) return tabel.jeugd[lager[lager.length - 1]];
  return tabel.jeugd[leeftijden[0]];
}

export interface BrutoComponenten {
  uurloon: number;
  gewerkteUren: number;
  basisloon: number;
  personeelstoeslag: number;
  zondagtoeslag: number;
  feestdagtoeslag: number;
  avondtoeslag: number;
  vakantietoeslag: number;
  vakantiedagen: number;
  atv: number;
}

/** Onafgeronde componenten voor één set uren. */
export function componenten(invoer: BrutoInvoer): BrutoComponenten {
  const { gewerkteUren, uurloon, zondagUren, feestdagUren, avondUren } = invoer;
  const basisloon = gewerkteUren * uurloon;
  const personeelstoeslag = gewerkteUren * TOESLAGEN.personeelstoeslagPerUur;
  return {
    uurloon,
    gewerkteUren,
    basisloon,
    personeelstoeslag,
    zondagtoeslag: zondagUren * uurloon * TOESLAGEN.zondagPct,
    feestdagtoeslag: feestdagUren * uurloon * TOESLAGEN.feestdagPct,
    avondtoeslag: avondUren * uurloon * TOESLAGEN.avondPct,
    vakantietoeslag: basisloon * TOESLAGEN.vakantietoeslagPct,
    vakantiedagen: basisloon * TOESLAGEN.vakantiedagenPct,
    atv: (basisloon + personeelstoeslag) * TOESLAGEN.atvPct,
  };
}

/** Tel componenten van meerdere diensten op (voor periodetotalen). */
export function somComponenten(lijst: BrutoComponenten[]): BrutoComponenten {
  const leeg: BrutoComponenten = {
    uurloon: 0, gewerkteUren: 0, basisloon: 0, personeelstoeslag: 0,
    zondagtoeslag: 0, feestdagtoeslag: 0, avondtoeslag: 0,
    vakantietoeslag: 0, vakantiedagen: 0, atv: 0,
  };
  return lijst.reduce((a, c) => ({
    uurloon: c.uurloon || a.uurloon,
    gewerkteUren: a.gewerkteUren + c.gewerkteUren,
    basisloon: a.basisloon + c.basisloon,
    personeelstoeslag: a.personeelstoeslag + c.personeelstoeslag,
    zondagtoeslag: a.zondagtoeslag + c.zondagtoeslag,
    feestdagtoeslag: a.feestdagtoeslag + c.feestdagtoeslag,
    avondtoeslag: a.avondtoeslag + c.avondtoeslag,
    vakantietoeslag: a.vakantietoeslag + c.vakantietoeslag,
    vakantiedagen: a.vakantiedagen + c.vakantiedagen,
    atv: a.atv + c.atv,
  }), leeg);
}

/**
 * Bruto totaal, afgerond zoals de loonstrook: de onregelmatigheidstoeslagen
 * (zondag + feestdag + avond) worden samen als één regel afgerond.
 */
export function brutoAfgerond(c: BrutoComponenten): number {
  const ort = c.zondagtoeslag + c.feestdagtoeslag + c.avondtoeslag;
  return round2(
    round2(c.basisloon) +
      round2(ort) +
      round2(c.personeelstoeslag) +
      round2(c.atv) +
      round2(c.vakantietoeslag) +
      round2(c.vakantiedagen)
  );
}

/** Uitklapbare opbouw-regels voor weergave (zondag/feestdag apart zichtbaar). */
export function regels(c: BrutoComponenten): LoonRegel[] {
  const r: LoonRegel[] = [
    { key: "basisloon", label: "Basisloon", bedrag: round2(c.basisloon), uren: c.gewerkteUren, toelichting: `${c.gewerkteUren} u × €${c.uurloon.toFixed(2)}` },
    { key: "personeelstoeslag", label: "Personeelstoeslag", bedrag: round2(c.personeelstoeslag), toelichting: `€${TOESLAGEN.personeelstoeslagPerUur.toFixed(2)} per gewerkt uur` },
  ];
  if (c.zondagtoeslag > 0) r.push({ key: "zondag", label: "Zondagtoeslag (+50%)", bedrag: round2(c.zondagtoeslag) });
  if (c.feestdagtoeslag > 0) r.push({ key: "feestdag", label: "Feestdagtoeslag (+100%)", bedrag: round2(c.feestdagtoeslag) });
  if (c.avondtoeslag > 0) r.push({ key: "avond", label: "Avondtoeslag na 22:00 (+50%)", bedrag: round2(c.avondtoeslag) });
  r.push(
    { key: "vakantietoeslag", label: "Vakantietoeslag (8%)", bedrag: round2(c.vakantietoeslag) },
    { key: "vakantiedagen", label: "Vakantiedagen (10,13%)", bedrag: round2(c.vakantiedagen) },
    { key: "atv", label: "ATV/ADV (8,1%)", bedrag: round2(c.atv) },
  );
  return r;
}

/** Aantal gewerkte uren van een dienst (klok minus pauze). */
export function gewerkteUrenVan(dienst: Dienst): number {
  return (dienst.eind.getTime() - dienst.start.getTime()) / MS_UUR - dienst.pauzeUur;
}

/** Uren met klok-eindtijd na de avondgrens (bijv. na 22:00). */
function urenNaGrens(dienst: Dienst, grensUur: number): number {
  const grens = new Date(dienst.start);
  grens.setHours(grensUur, 0, 0, 0);
  const na = (dienst.eind.getTime() - Math.max(dienst.start.getTime(), grens.getTime())) / MS_UUR;
  return Math.max(0, na);
}

export interface DienstBuckets extends BrutoInvoer {
  isZondag: boolean;
  isFeestdag: boolean;
  feestdagNaam?: string;
}

/** Bepaal de toeslag-bakjes (zondag/feestdag/avond) voor één dienst. */
export function bucketsVoorDienst(dienst: Dienst, loon: Loongegevens): DienstBuckets {
  const datum = dienst.start;
  const uurloon = uurloonVoorDatum(datum, loon);
  const gewerkteUren = gewerkteUrenVan(dienst);
  const fdNaam = feestdagNaam(datum);
  const isFeestdag = fdNaam !== undefined;
  const isZondag = datum.getDay() === 0;

  let zondagUren = 0, feestdagUren = 0, avondUren = 0;
  if (isFeestdag) {
    feestdagUren = gewerkteUren; // hele feestdag-dienst dubbel
  } else if (isZondag) {
    zondagUren = gewerkteUren; // hele zondag +50% (uren na 22:00 ook 50%, geen dubbeltelling)
  } else {
    avondUren = Math.min(gewerkteUren, urenNaGrens(dienst, TOESLAGEN.avondGrensUur));
  }
  return { gewerkteUren, uurloon, zondagUren, feestdagUren, avondUren, isZondag, isFeestdag, feestdagNaam: fdNaam };
}

export function componentenVoorDienst(dienst: Dienst, loon: Loongegevens): BrutoComponenten {
  return componenten(bucketsVoorDienst(dienst, loon));
}

export function loonVoorDienst(dienst: Dienst, loon: Loongegevens): DienstLoon {
  const b = bucketsVoorDienst(dienst, loon);
  const c = componenten(b);
  const maaltijd = dienst.pauzeUur >= OVERIG.maaltijdMinPauzeUur ? OVERIG.maaltijdvergoeding : 0;
  return {
    dienst, datum: dienst.start, uurloon: b.uurloon, gewerkteUren: b.gewerkteUren,
    zondagUren: b.zondagUren, feestdagUren: b.feestdagUren, avondUren: b.avondUren,
    isZondag: b.isZondag, isFeestdag: b.isFeestdag, feestdagNaam: b.feestdagNaam,
    regels: regels(c),
    bruto: brutoAfgerond(c),
    maaltijdvergoeding: maaltijd,
  };
}
