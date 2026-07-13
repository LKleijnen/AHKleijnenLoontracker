/**
 * Reken-engine: zet uren + uurloon om in bruto-loon met volledige opbouw.
 * Reproduceert de loonstroken exact (zie scripts/validate.ts).
 */
import { LOONTABELLEN, TOESLAGEN, OVERIG } from "./config";
import type { Loonschaaltabel, Schaal } from "./config";
import { feestdagNaam } from "./holidays";
import { periode, periodeIndexVoor } from "./periods";
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

/** Kies de loontabel die op `datum` van kracht is (nieuwste `vanaf` ≤ datum). */
function loontabelVoor(datum: Date, schaal: Schaal): Loonschaaltabel {
  let gekozen = LOONTABELLEN[0];
  for (const v of LOONTABELLEN) {
    if (new Date(`${v.vanaf}T00:00:00`) <= datum) gekozen = v;
  }
  return gekozen.tabel[schaal];
}

/**
 * Krijgt de werknemer op `datum` nog de €2/uur personeelstoeslag?
 * CAO-regel: van je 16e t/m de AH 4-weken-periode waarin je 20 wordt; daarna niet meer.
 * De grens ligt op de periode van de verjaardag (niet de losse datum), net als bij het
 * uurloon — geverifieerd: de periode t/m 17 mei kreeg hem nog, de periode erna €0.
 */
export function personeelstoeslagActief(datum: Date, geboortedatum: Geboortedatum): boolean {
  const { jaar, maand, dag } = geboortedatum;
  const verjaardag = (n: number) => new Date(jaar + n, maand - 1, dag);
  const idx = periodeIndexVoor(datum);
  return idx >= periodeIndexVoor(verjaardag(16)) && idx <= periodeIndexVoor(verjaardag(20));
}

/**
 * Uurloon op een datum volgens de CAO-tabel, op basis van schaal, leeftijd en
 * functiejaren. Onder 21 telt de leeftijd (jeugdloon, functiejaren genegeerd);
 * vanaf 21 telt het functiejaar. Valt terug op de dichtstbijzijnde bekende
 * jeugdleeftijd binnen de schaal als een leeftijd niet in de tabel staat.
 *
 * De leeftijd wordt bepaald op het EIND van de 4-weken-periode waarin de datum
 * valt: word je ergens in een periode jarig, dan geldt het nieuwe (jeugd)loon
 * voor de hele periode — niet pas vanaf de verjaardag. Zo betaalt de werkgever
 * het ook (geverifieerd op de loonstrook van de periode rond verjaardag 16 mei).
 */
export function uurloonVoorDatum(datum: Date, loon: Loongegevens): number {
  // Eigen basisuurloon ingevuld? Dan de CAO-tabel negeren en dit bedrag gebruiken.
  if (loon.customUurloon != null && loon.customUurloon > 0) return loon.customUurloon;

  const periodeEind = periode(periodeIndexVoor(datum)).eind;
  const tabel = loontabelVoor(periodeEind, loon.schaal);
  const leeftijd = leeftijdOp(periodeEind, loon.geboortedatum);

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
  const { gewerkteUren, uurloon, zondagUren, feestdagUren, avondUren, personeelstoeslagPerUur } = invoer;
  const zondagPct = invoer.zondagPct ?? TOESLAGEN.zondagPct;
  const basisloon = gewerkteUren * uurloon;
  const personeelstoeslag = gewerkteUren * personeelstoeslagPerUur;
  return {
    uurloon,
    gewerkteUren,
    basisloon,
    personeelstoeslag,
    zondagtoeslag: zondagUren * uurloon * zondagPct,
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

/**
 * Onafgeronde som van alle bruto-componenten. Voor de live-weergave tijdens een
 * dienst: een vloeiend, continu oplopend bedrag (i.t.t. `brutoAfgerond`, dat per
 * component op centen afrondt en daardoor in sprongetjes loopt).
 */
export function brutoRuw(c: BrutoComponenten): number {
  return (
    c.basisloon + c.personeelstoeslag + c.zondagtoeslag + c.feestdagtoeslag +
    c.avondtoeslag + c.vakantietoeslag + c.vakantiedagen + c.atv
  );
}

/** Uitklapbare opbouw-regels voor weergave (zondag/feestdag apart zichtbaar). */
export function regels(c: BrutoComponenten, zondagPct: number = TOESLAGEN.zondagPct): LoonRegel[] {
  const r: LoonRegel[] = [
    { key: "basisloon", label: "Basisloon", bedrag: round2(c.basisloon), uren: c.gewerkteUren, toelichting: `${c.gewerkteUren} u × €${c.uurloon.toFixed(2)}` },
  ];
  if (c.personeelstoeslag > 0) {
    const perUur = c.gewerkteUren > 0 ? c.personeelstoeslag / c.gewerkteUren : 0;
    r.push({ key: "personeelstoeslag", label: "Personeelstoeslag", bedrag: round2(c.personeelstoeslag), toelichting: `€${perUur.toFixed(2)} per gewerkt uur` });
  }
  if (c.zondagtoeslag > 0) r.push({ key: "zondag", label: `Zondagtoeslag (+${Math.round(zondagPct * 100)}%)`, bedrag: round2(c.zondagtoeslag) });
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
    // De zondaguren tot 22:00 krijgen de (instelbare) zondagtoeslag; de uren ná
    // 22:00 blijven altijd op +50% (onregelmatig), ook als zondag dubbel telt.
    // Bij de standaard +50% is dit identiek aan de hele zondag op +50%.
    const na22 = Math.min(gewerkteUren, urenNaGrens(dienst, TOESLAGEN.avondGrensUur));
    zondagUren = gewerkteUren - na22;
    avondUren = na22;
  } else {
    avondUren = Math.min(gewerkteUren, urenNaGrens(dienst, TOESLAGEN.avondGrensUur));
  }
  const personeelstoeslagPerUur = personeelstoeslagActief(datum, loon.geboortedatum)
    ? TOESLAGEN.personeelstoeslagPerUur
    : 0;
  const zondagPct = loon.zondagDubbel ? TOESLAGEN.feestdagPct : TOESLAGEN.zondagPct;
  return { gewerkteUren, uurloon, zondagUren, feestdagUren, avondUren, personeelstoeslagPerUur, zondagPct, isZondag, isFeestdag, feestdagNaam: fdNaam };
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
    regels: regels(c, b.zondagPct),
    bruto: brutoAfgerond(c),
    maaltijdvergoeding: maaltijd,
  };
}
