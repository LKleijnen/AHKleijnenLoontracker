import type { Schaal } from "./config";

/** Geboortedatum als losse velden (lokale datum, geen tijdzone-gedoe). */
export interface Geboortedatum {
  jaar: number;
  maand: number; // 1-12
  dag: number;
}

/** Loon-bepalende gegevens van één gebruiker (bepalen het uurloon). */
export interface Loongegevens {
  geboortedatum: Geboortedatum;
  schaal: Schaal;
  functiejaren: number; // 0 = startjaar (21+); telt niet mee onder 21
}

/** Alles wat een gebruiker invult en in localStorage bewaart. */
export interface Instellingen extends Loongegevens {
  icalUrl: string;
}

/** Waar een dienst vandaan komt: uit de iCal of handmatig toegevoegd. */
export type DienstBron = "ical" | "handmatig";

/** Eén dienst zoals uit de rooster-iCal geparsed. Tijden zijn lokale wandkloktijd. */
export interface Dienst {
  uid: string;
  start: Date;
  eind: Date;
  pauzeUur: number;
  afdeling: string; // SUMMARY, bijv. "Operatie"
  bron?: DienstBron; // afwezig = "ical"
}

/**
 * Eén dienst als ruwe, opslagbare gegevens — géén loon, géén tijdzone.
 * Tijden zijn naïeve wandkloktijd "YYYY-MM-DDTHH:mm" (precies wat de iCal
 * aangeeft), zodat herberekenen in elke tijdzone hetzelfde uur teruggeeft.
 * Dit is wat we per gewerkte dienst bewaren (lokaal of in de cloud).
 */
export interface RuweDienst {
  uid: string;
  start: string;
  eind: string;
  pauzeUur: number;
  afdeling: string;
  bron?: DienstBron; // afwezig = "ical"
}

/** Eén regel in de uitklapbare opbouw van een dienst/periode. */
export interface LoonRegel {
  key: string;
  label: string;
  bedrag: number; // euro
  uren?: number;
  toelichting?: string;
}

/** Berekend loon voor één dienst. */
export interface DienstLoon {
  dienst: Dienst;
  datum: Date;
  uurloon: number;
  gewerkteUren: number;
  zondagUren: number;
  feestdagUren: number;
  avondUren: number; // uren na de avondgrens (niet zondag/feestdag)
  isZondag: boolean;
  isFeestdag: boolean;
  feestdagNaam?: string;
  regels: LoonRegel[]; // bruto-componenten
  bruto: number;
  maaltijdvergoeding: number; // netto/onbelast, los van bruto
}

/** Invoer voor de pure bruto-berekening (ook gebruikt door validatie). */
export interface BrutoInvoer {
  gewerkteUren: number;
  uurloon: number;
  zondagUren: number;
  feestdagUren: number;
  avondUren: number;
}
