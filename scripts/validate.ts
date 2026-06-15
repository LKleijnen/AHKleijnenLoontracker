/**
 * Controleert de reken-engine tegen de bekende uren en bruto-totalen van
 * periode 7 en 8 uit de loonstroken.
 */
import { componenten, brutoAfgerond, regels } from "../src/lib/pay";
import type { BrutoInvoer } from "../src/lib/types";

interface Case {
  naam: string;
  invoer: BrutoInvoer;
  verwachtBruto: number;
  // verwachte deelregels van de strook (label -> bedrag)
  verwacht: Record<string, number>;
}

const cases: Case[] = [
  {
    naam: "Periode 7 (19 jr, €10,49)",
    invoer: { gewerkteUren: 38.75, uurloon: 10.49, zondagUren: 3.75, feestdagUren: 5.5, avondUren: 0 },
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
    naam: "Periode 8 (20 jr, €11,79)",
    invoer: { gewerkteUren: 54.75, uurloon: 11.79, zondagUren: 10.0, feestdagUren: 6.25, avondUren: 0 },
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

console.log(`\n${fouten === 0 ? "✅ Alles klopt tot op de cent." : `❌ ${fouten} afwijking(en).`}`);
process.exit(fouten === 0 ? 0 : 1);
