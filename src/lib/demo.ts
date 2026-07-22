/**
 * Demo-modus: een compleet voorbeeldrooster zodat iemand zónder
 * personeelstool-account (portfolio-bezoeker, sollicitatiegesprek) de app kan
 * uitproberen. Er wordt niets opgehaald en niets opgeslagen — de diensten
 * worden ter plekke uit de huidige datum afgeleid.
 *
 * Het rooster loopt van twee maanden terug tot een maand vooruit, zodat er
 * meteen afgelopen periodes, een lopende periode én een voorspelling te zien
 * zijn. Er staat altijd een dienst "aan" op het moment van bezoek (een uur
 * ervoor begonnen, een uur erna klaar) zodat ook de live-teller draait.
 */
import { naarRuw } from "./diensten";
import type { Dienst, Instellingen, RuweDienst } from "./types";

/** Voorbeeldprofiel achter de "onboarding overslaan"-knop in de demo. */
export const DEMO_INSTELLINGEN: Instellingen = {
  geboortedatum: { jaar: 2006, maand: 5, dag: 16 },
  schaal: "A",
  functiejaren: 0,
  icalUrl: "",
};

const MAANDEN_TERUG = 2;
const MAANDEN_VOORUIT = 1;
const UUR_MS = 3600000;

const AFDELINGEN = ["Operatie", "Vers", "Kassa"];

/** Begin- en eindtijd als decimaal uur: 16.5 = 16:30. */
interface Sjabloon {
  begin: number;
  eind: number;
}

// Herkenbare AH-diensten. De late avonddiensten lopen door na 22:00 zodat de
// avondtoeslag zichtbaar wordt; de lange dagdiensten hebben pauze (en dus
// maaltijdvergoeding), en de zondagen laten de zondagtoeslag zien.
const DOORDEWEEKS: Sjabloon[] = [
  { begin: 16, eind: 20.5 },
  { begin: 17, eind: 21 },
  { begin: 18, eind: 22.5 },
  { begin: 13, eind: 18 },
];
const ZATERDAG: Sjabloon[] = [
  { begin: 9, eind: 15 },
  { begin: 10.5, eind: 17 },
  { begin: 15, eind: 21 },
];
const ZONDAG: Sjabloon[] = [
  { begin: 12, eind: 18 },
  { begin: 11, eind: 16.5 },
];

/** Kans op een dienst per weekdag (index = getDay(), zo=0 … za=6). */
const KANS = [0.38, 0.42, 0.42, 0.42, 0.42, 0.45, 0.72];

/**
 * Deterministische pseudo-random uit een kalenderdatum. Dezelfde dag levert
 * altijd hetzelfde getal, zodat het demo-rooster niet bij elk bezoek
 * verspringt: wat je gisteren zag staat er vandaag nog net zo in.
 */
function ruis(datum: Date): number {
  let x = datum.getFullYear() * 10000 + (datum.getMonth() + 1) * 100 + datum.getDate();
  x = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function sjabloonVoor(dag: number, r: number): Sjabloon {
  const lijst = dag === 0 ? ZONDAG : dag === 6 ? ZATERDAG : DOORDEWEEKS;
  return lijst[Math.floor(r / 1024) % lijst.length];
}

/** Pauze zoals de personeelstool die geeft: pas vanaf een langere dienst. */
function pauzeVoor(duurUur: number): number {
  if (duurUur >= 6) return 0.5;
  if (duurUur >= 4.5) return 0.25;
  return 0;
}

function opUur(dag: Date, uurDecimaal: number): Date {
  const u = Math.floor(uurDecimaal);
  const m = Math.round((uurDecimaal - u) * 60);
  return new Date(dag.getFullYear(), dag.getMonth(), dag.getDate(), u, m);
}

function zelfdeDag(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Het volledige demo-rooster rond `nu`, als ruwe diensten — precies het formaat
 * dat de iCal-route anders teruggeeft, zodat de rest van de app niets van de
 * demo hoeft te weten.
 */
export function demoDiensten(nu: Date = new Date()): RuweDienst[] {
  const diensten: Dienst[] = [];

  const eersteDag = new Date(nu.getFullYear(), nu.getMonth() - MAANDEN_TERUG, nu.getDate());
  const laatsteDag = new Date(nu.getFullYear(), nu.getMonth() + MAANDEN_VOORUIT, nu.getDate());

  for (const dag = new Date(eersteDag); dag <= laatsteDag; dag.setDate(dag.getDate() + 1)) {
    // Vandaag is gereserveerd voor de lopende dienst hieronder.
    if (zelfdeDag(dag, nu)) continue;
    const r = ruis(dag);
    if ((r % 1000) / 1000 >= KANS[dag.getDay()]) continue;

    const s = sjabloonVoor(dag.getDay(), r);
    const start = opUur(dag, s.begin);
    diensten.push({
      uid: `demo-${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`,
      start,
      eind: opUur(dag, s.eind),
      pauzeUur: pauzeVoor(s.eind - s.begin),
      afdeling: AFDELINGEN[Math.floor(r / 64) % AFDELINGEN.length],
    });
  }

  // De dienst die nú loopt: een uur geleden begonnen, over een uur klaar.
  diensten.push({
    uid: "demo-live",
    start: new Date(nu.getTime() - UUR_MS),
    eind: new Date(nu.getTime() + UUR_MS),
    pauzeUur: 0,
    afdeling: "Vers",
  });

  return diensten.map(naarRuw);
}
