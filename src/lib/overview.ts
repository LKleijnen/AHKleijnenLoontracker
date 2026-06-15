/**
 * Bouwt het volledige overzicht (periodes + diensten + opbouw) uit een lijst
 * diensten. Wordt server-side gedraaid en als JSON naar de UI gestuurd.
 */
import {
  loonVoorDienst, componentenVoorDienst, somComponenten, brutoAfgerond,
} from "./pay";
import { periode, periodeIndexVoor, huidigePeriode } from "./periods";
import type { Dienst } from "./types";

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
  regels: RegelUit[];
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
}
export interface Overzicht {
  gegenereerdLabel: string;
  huidigeIndex: number;
  periodes: PeriodeUit[];
}

const datumKort = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const datumLang = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const datumDM = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const tijdFmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function round2(x: number) { return Math.round((x + Number.EPSILON) * 100) / 100; }

function dienstUit(dienst: Dienst, nu: Date): DienstUit {
  const l = loonVoorDienst(dienst);
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
    regels: l.regels.map((r) => ({ label: r.label, bedrag: r.bedrag, toelichting: r.toelichting })),
  };
}

export function bouwOverzicht(diensten: Dienst[], nu: Date = new Date()): Overzicht {
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
    const dUit = lijst.map((d) => dienstUit(d, nu));

    const bruto = brutoAfgerond(somComponenten(lijst.map(componentenVoorDienst)));
    const gewerkt = lijst.filter((d) => d.eind.getTime() <= nu.getTime());
    const opgebouwd = brutoAfgerond(somComponenten(gewerkt.map(componentenVoorDienst)));
    const maaltijd = round2(dUit.reduce((s, d) => s + d.maaltijd, 0));
    const uren = round2(dUit.reduce((s, d) => s + d.gewerkteUren, 0));

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
    });
  }

  periodes.sort((a, b) => b.index - a.index); // nieuwste/toekomst eerst

  return {
    gegenereerdLabel: new Intl.DateTimeFormat("nl-NL", { dateStyle: "full", timeStyle: "short" }).format(nu),
    huidigeIndex: huidig.index,
    periodes,
  };
}
