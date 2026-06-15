/**
 * Nederlandse feestdagen met +100% (dubbel loon).
 */

/** Eerste paasdag (Gregoriaans, Anonymous algorithm) als [maand, dag]. */
function pasen(jaar: number): { maand: number; dag: number } {
  const a = jaar % 19;
  const b = Math.floor(jaar / 100);
  const c = jaar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return { maand, dag };
}

function ymd(jaar: number, maand: number, dag: number): string {
  return `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}

function plusDagen(jaar: number, maand: number, dag: number, n: number): string {
  const d = new Date(Date.UTC(jaar, maand - 1, dag + n));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Map van "YYYY-MM-DD" -> feestdagnaam voor een jaar. */
export function feestdagenVoorJaar(jaar: number): Record<string, string> {
  const p = pasen(jaar);
  const map: Record<string, string> = {};
  // Erkende feestdagen met +100% (dubbel). Een feestdag op zondag (1e Paasdag,
  // 1e Pinksterdag) wint van de zondagtoeslag.
  map[ymd(jaar, 1, 1)] = "Nieuwjaarsdag";
  map[plusDagen(jaar, p.maand, p.dag, 0)] = "Eerste paasdag";
  map[plusDagen(jaar, p.maand, p.dag, 1)] = "Tweede paasdag";
  // Koningsdag 27 april, of 26 april als 27 april een zondag is
  const k = new Date(Date.UTC(jaar, 3, 27));
  map[k.getUTCDay() === 0 ? ymd(jaar, 4, 26) : ymd(jaar, 4, 27)] = "Koningsdag";
  // Bevrijdingsdag is alleen een (betaalde) feestdag in lustrumjaren.
  if (jaar % 5 === 0) map[ymd(jaar, 5, 5)] = "Bevrijdingsdag";
  map[plusDagen(jaar, p.maand, p.dag, 39)] = "Hemelvaartsdag";
  map[plusDagen(jaar, p.maand, p.dag, 49)] = "Eerste pinksterdag";
  map[plusDagen(jaar, p.maand, p.dag, 50)] = "Tweede pinksterdag";
  map[ymd(jaar, 12, 25)] = "Eerste kerstdag";
  map[ymd(jaar, 12, 26)] = "Tweede kerstdag";
  return map;
}

export function feestdagNaam(datum: Date): string | undefined {
  const sleutel = ymd(datum.getFullYear(), datum.getMonth() + 1, datum.getDate());
  return feestdagenVoorJaar(datum.getFullYear())[sleutel];
}

export function isFeestdag(datum: Date): boolean {
  return feestdagNaam(datum) !== undefined;
}
