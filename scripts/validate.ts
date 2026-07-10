/**
 * Controleert de reken-engine tegen de bekende uren en bruto-totalen uit de
 * loonstroken (drie periodes), plus de datumlogica van uurloon en personeelstoeslag.
 */
import { componenten, brutoAfgerond, regels, uurloonVoorDatum, personeelstoeslagActief } from "../src/lib/pay";
import type { BrutoInvoer, Loongegevens } from "../src/lib/types";

interface Case {
  naam: string;
  invoer: BrutoInvoer;
  verwachtBruto: number;
  // verwachte deelregels van de strook (label -> bedrag)
  verwacht: Record<string, number>;
}

const cases: Case[] = [
  {
    naam: "Periode 7 (19 jr, €10,49, met personeelstoeslag)",
    invoer: { gewerkteUren: 38.75, uurloon: 10.49, zondagUren: 3.75, feestdagUren: 5.5, avondUren: 0, personeelstoeslagPerUur: 2.0 },
    verwachtBruto: 674.23,
    verwacht: {
      basisloon: 406.49,
      "onregelmatigheidstoeslag (zondag+feestdag)": 77.36,
      personeelstoeslag: 77.5,
      vakantietoeslag: 32.52,
      vakantiedagen: 41.16,
      atv: 39.2,
    },
  },
  {
    naam: "Periode 8 (20 jr, €11,79, laatste periode mét personeelstoeslag)",
    invoer: { gewerkteUren: 54.75, uurloon: 11.79, zondagUren: 10.0, feestdagUren: 6.25, avondUren: 0, personeelstoeslagPerUur: 2.0 },
    verwachtBruto: 1065.81,
    verwacht: {
      basisloon: 645.5,
      "onregelmatigheidstoeslag (zondag+feestdag)": 132.64,
      personeelstoeslag: 109.5,
      vakantietoeslag: 51.64,
      vakantiedagen: 65.37,
      atv: 61.16,
    },
  },
  {
    // Verloningsperiode 7/2026 (run 08-07-2026): uren gewerkt 18 mei – 14 jun,
    // uurloon €11,99, personeelstoeslag vervallen (periode ná die van de 20e verjaardag).
    naam: "Verl.per 7/2026 (20 jr, €11,99, GEEN personeelstoeslag)",
    invoer: { gewerkteUren: 44.25, uurloon: 11.99, zondagUren: 9.0, feestdagUren: 3.5, avondUren: 0, personeelstoeslagPerUur: 0 },
    verwachtBruto: 765.63,
    verwacht: {
      basisloon: 530.56,
      "onregelmatigheidstoeslag (zondag+feestdag)": 95.92,
      personeelstoeslag: 0,
      vakantietoeslag: 42.44,
      vakantiedagen: 53.73,
      atv: 42.98,
    },
  },
];

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
let fouten = 0;

for (const c of cases) {
  const comp = componenten(c.invoer);
  const bruto = brutoAfgerond(comp);
  const ort = r2(comp.zondagtoeslag + comp.feestdagtoeslag + comp.avondtoeslag);
  const gemeten: Record<string, number> = {
    basisloon: r2(comp.basisloon),
    "onregelmatigheidstoeslag (zondag+feestdag)": ort,
    personeelstoeslag: r2(comp.personeelstoeslag),
    vakantietoeslag: r2(comp.vakantietoeslag),
    vakantiedagen: r2(comp.vakantiedagen),
    atv: r2(comp.atv),
  };

  console.log(`\n=== ${c.naam} ===`);
  for (const [label, verwacht] of Object.entries(c.verwacht)) {
    const got = gemeten[label];
    const ok = Math.abs(got - verwacht) < 0.005;
    if (!ok) fouten++;
    console.log(`  ${ok ? "OK " : "XX "} ${label.padEnd(42)} verwacht €${verwacht.toFixed(2).padStart(8)}  gemeten €${got.toFixed(2).padStart(8)}`);
  }
  const okBruto = Math.abs(bruto - c.verwachtBruto) < 0.005;
  if (!okBruto) fouten++;
  console.log(`  ${okBruto ? "OK " : "XX "} ${"BRUTO".padEnd(42)} verwacht €${c.verwachtBruto.toFixed(2).padStart(8)}  gemeten €${bruto.toFixed(2).padStart(8)}`);
  void regels; // (regels() wordt door de UI gebruikt)
}

// --- Datumlogica: uurloon-tabel per datum + personeelstoeslag-venster (schaal C) ---
const medewerker: Loongegevens = { geboortedatum: { jaar: 2006, maand: 5, dag: 16 }, schaal: "C", functiejaren: 0 };
const inP5 = new Date(2026, 4, 10); // 10 mei 2026 — periode t/m 17 mei (de 20e verjaardag valt hierin)
const inP6 = new Date(2026, 5, 1); //  1 jun 2026 — eerste periode ná de 20e verjaardag

interface Check { naam: string; verwacht: number | boolean; gemeten: number | boolean; }
const checks: Check[] = [
  { naam: "uurloon 10 mei 2026 (schaal C, 20 jr, vóór verhoging)", verwacht: 11.79, gemeten: uurloonVoorDatum(inP5, medewerker) },
  { naam: "uurloon 1 jun 2026 (schaal C, 20 jr, ná verhoging)", verwacht: 11.99, gemeten: uurloonVoorDatum(inP6, medewerker) },
  { naam: "personeelstoeslag actief 10 mei 2026 (periode van 20e verjaardag)", verwacht: true, gemeten: personeelstoeslagActief(inP5, medewerker.geboortedatum) },
  { naam: "personeelstoeslag vervallen 1 jun 2026 (periode erna)", verwacht: false, gemeten: personeelstoeslagActief(inP6, medewerker.geboortedatum) },
];

console.log(`\n=== Datumlogica uurloon + personeelstoeslag ===`);
for (const c of checks) {
  const ok = typeof c.verwacht === "number"
    ? Math.abs((c.gemeten as number) - c.verwacht) < 0.005
    : c.gemeten === c.verwacht;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK " : "XX "} ${c.naam.padEnd(52)} verwacht ${String(c.verwacht).padStart(7)}  gemeten ${String(c.gemeten).padStart(7)}`);
}

console.log(`\n${fouten === 0 ? "✅ Alles klopt tot op de cent." : `❌ ${fouten} afwijking(en).`}`);
process.exit(fouten === 0 ? 0 : 1);
