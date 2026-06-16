/**
 * Bouwt het volledige overzicht (periodes + diensten + opbouw) uit een lijst
 * diensten. Wordt server-side gedraaid en als JSON naar de UI gestuurd.
 */
import {
  loonVoorDienst, componentenVoorDienst, componenten, somComponenten,
  brutoAfgerond, uurloonVoorDatum,
} from "./pay";
import { TOESLAGEN } from "./config";
import { periode, periodeIndexVoor, huidigePeriode } from "./periods";
import type { Dienst, Loongegevens } from "./types";

export interface RegelUit { label: string; bedrag: number; toelichting?: string; }
export interface DienstUit {
  uid: string;
  datumISO: string;
  datumLabel: string; // "zo 14 jun"
  tijd: string; // "15:00–20:00"
  afdeling: string;
  gewerkteUren: number;
  bruto: number;
  maaltijd: number;
  badge?: string;
  isGewerkt: boolean; // ligt in het verleden
  bron?: "ical" | "handmatig"; // afwezig = ical
  regels: RegelUit[];
}
export interface WeekUit {
  weeknummer: number;
  jaar: number;
  bruto: number;
  uren: number;
  aantalDiensten: number;
  diensten: DienstUit[];
}
export interface PeriodeUit {
  index: number;
  nummer: number;
  jaar: number;
  label: string;
  periodeLabel: string; // "18 mei – 14 jun 2026"
  paydatumLabel: string;
  isHuidig: boolean;
  isToekomst: boolean;
  bruto: number; // hele periode
  opgebouwd: number; // alleen diensten t/m vandaag
  maaltijd: number;
  uren: number;
  aantalDiensten: number;
  diensten: DienstUit[];
  weken: WeekUit[];
}
export interface Tarieven {
  uurloon: number; // basis
  zondag: number; // basis + 50%
  feestdag: number; // basis + 100%
  allIn: number; // all-in per normaal gewerkt uur
  allInZondag: number; // all-in inclusief zondagtoeslag
  allInFeestdag: number; // all-in inclusief feestdagtoeslag
}
export interface Overzicht {
  gegenereerdLabel: string;
  huidigeIndex: number;
  tarieven: Tarieven;
  periodes: PeriodeUit[];
}

const datumKort = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const datumLang = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const datumDM = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const tijdFmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function round2(x: number) { return Math.round((x + Number.EPSILON) * 100) / 100; }

/** ISO 8601 weeknummer (week begint maandag, week 1 bevat de eerste donderdag). */
function isoWeek(date: Date): { week: number; jaar: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // ma=0 .. zo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // donderdag van deze week
  const donderdag = d.getTime();
  const jaar = d.getUTCFullYear();
  const eersteJan = new Date(Date.UTC(jaar, 0, 1));
  const week = 1 + Math.round((donderdag - eersteJan.getTime()) / 86400000 / 7);
  return { week, jaar };
}

function dienstUit(dienst: Dienst, nu: Date, loon: Loongegevens): DienstUit {
  const l = loonVoorDienst(dienst, loon);
  let badge: string | undefined;
  if (l.isFeestdag) badge = l.feestdagNaam;
  else if (l.isZondag) badge = "Zondag";
  return {
    uid: dienst.uid,
    datumISO: dienst.start.toISOString(),
    datumLabel: datumKort.format(dienst.start),
    tijd: `${tijdFmt(dienst.start)}–${tijdFmt(dienst.eind)}`,
    afdeling: dienst.afdeling,
    gewerkteUren: round2(l.gewerkteUren),
    bruto: l.bruto,
    maaltijd: l.maaltijdvergoeding,
    badge,
    isGewerkt: dienst.eind.getTime() <= nu.getTime(),
    bron: dienst.bron,
    regels: l.regels.map((r) => ({ label: r.label, bedrag: r.bedrag, toelichting: r.toelichting })),
  };
}

function berekenTarieven(nu: Date, loon: Loongegevens): Tarieven {
  const uurloon = uurloonVoorDatum(nu, loon);
  const euroR = (x: number) => Math.round(x * 100 + 1e-6) / 100; // centen-veilig
  // All-in per uur = alle bruto-componenten samen voor één gewerkt uur.
  const allInVoor = (zondagUren: number, feestdagUren: number) => {
    const c = componenten({ gewerkteUren: 1, uurloon, zondagUren, feestdagUren, avondUren: 0 });
    return c.basisloon + c.personeelstoeslag + c.zondagtoeslag + c.feestdagtoeslag +
      c.avondtoeslag + c.vakantietoeslag + c.vakantiedagen + c.atv;
  };
  return {
    uurloon: euroR(uurloon),
    zondag: euroR(uurloon * (1 + TOESLAGEN.zondagPct)),
    feestdag: euroR(uurloon * (1 + TOESLAGEN.feestdagPct)),
    allIn: euroR(allInVoor(0, 0)),
    allInZondag: euroR(allInVoor(1, 0)),
    allInFeestdag: euroR(allInVoor(0, 1)),
  };
}

export function bouwOverzicht(diensten: Dienst[], loon: Loongegevens, nu: Date = new Date()): Overzicht {
  const huidig = huidigePeriode(nu);

  // Groepeer diensten per periode-index.
  const perIndex = new Map<number, Dienst[]>();
  for (const d of diensten) {
    const idx = periodeIndexVoor(d.start);
    (perIndex.get(idx) ?? perIndex.set(idx, []).get(idx)!).push(d);
  }
  // Zorg dat de huidige periode altijd bestaat.
  if (!perIndex.has(huidig.index)) perIndex.set(huidig.index, []);

  const periodes: PeriodeUit[] = [];
  for (const [idx, lijst] of perIndex) {
    const p = periode(idx);
    lijst.sort((a, b) => a.start.getTime() - b.start.getTime());
    const dUit = lijst.map((d) => dienstUit(d, nu, loon));
    const dUitByUid = new Map(dUit.map((d) => [d.uid, d]));

    const bruto = brutoAfgerond(somComponenten(lijst.map((d) => componentenVoorDienst(d, loon))));
    const gewerkt = lijst.filter((d) => d.eind.getTime() <= nu.getTime());
    const opgebouwd = brutoAfgerond(somComponenten(gewerkt.map((d) => componentenVoorDienst(d, loon))));
    const maaltijd = round2(dUit.reduce((s, d) => s + d.maaltijd, 0));
    const uren = round2(dUit.reduce((s, d) => s + d.gewerkteUren, 0));

    // Opdeling per (ISO-)week.
    const weekMap = new Map<string, { week: number; jaar: number; diensten: Dienst[] }>();
    for (const d of lijst) {
      const w = isoWeek(d.start);
      const key = `${w.jaar}-${w.week}`;
      if (!weekMap.has(key)) weekMap.set(key, { week: w.week, jaar: w.jaar, diensten: [] });
      weekMap.get(key)!.diensten.push(d);
    }
    const weken: WeekUit[] = [...weekMap.values()].map((w) => {
      const wd = w.diensten.map((d) => dUitByUid.get(d.uid)!);
      return {
        weeknummer: w.week,
        jaar: w.jaar,
        bruto: brutoAfgerond(somComponenten(w.diensten.map((d) => componentenVoorDienst(d, loon)))),
        uren: round2(wd.reduce((s, x) => s + x.gewerkteUren, 0)),
        aantalDiensten: w.diensten.length,
        diensten: wd,
      };
    });

    periodes.push({
      index: idx,
      nummer: p.nummer,
      jaar: p.jaar,
      label: `Periode ${p.nummer}`,
      periodeLabel: `${datumDM.format(p.start)} – ${datumLang.format(p.eind)}`,
      paydatumLabel: datumLang.format(p.paydatum),
      isHuidig: idx === huidig.index,
      isToekomst: idx > huidig.index,
      bruto,
      opgebouwd: idx === huidig.index ? opgebouwd : bruto,
      maaltijd,
      uren,
      aantalDiensten: lijst.length,
      diensten: dUit,
      weken,
    });
  }

  periodes.sort((a, b) => b.index - a.index); // nieuwste/toekomst eerst

  return {
    gegenereerdLabel: new Intl.DateTimeFormat("nl-NL", { dateStyle: "full", timeStyle: "short" }).format(nu),
    huidigeIndex: huidig.index,
    tarieven: berekenTarieven(nu, loon),
    periodes,
  };
}
