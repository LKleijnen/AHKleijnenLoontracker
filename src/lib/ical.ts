/**
 * Dependency-vrije iCal-parser voor het personeelstool-rooster.
 * Tijden worden als lokale wandkloktijd (Europe/Amsterdam) gelezen, voor
 * dag-van-de-week en de 22:00-grens.
 */
import type { Dienst } from "./types";

function veld(blok: string, naam: string): string {
  const m = blok.match(new RegExp("^" + naam + "[^:\\r\\n]*:(.*)$", "m"));
  return m ? m[1].trim() : "";
}

function parseDatum(waarde: string): Date | null {
  const m = waarde.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

function parsePauze(desc: string): number {
  const m = desc.match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] + +m[2] / 60 : 0;
}

export function parseRooster(ics: string): Dienst[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, ""); // line unfolding
  const blokken = unfolded.split("BEGIN:VEVENT").slice(1);
  const diensten: Dienst[] = [];
  for (const ruw of blokken) {
    const blok = ruw.split("END:VEVENT")[0];
    const start = parseDatum(veld(blok, "DTSTART"));
    const eind = parseDatum(veld(blok, "DTEND"));
    if (!start || !eind) continue;
    diensten.push({
      uid: veld(blok, "UID") || `${start.getTime()}`,
      start,
      eind,
      pauzeUur: parsePauze(veld(blok, "DESCRIPTION")),
      afdeling: veld(blok, "SUMMARY") || "Dienst",
    });
  }
  diensten.sort((a, b) => a.start.getTime() - b.start.getTime());
  return diensten;
}
