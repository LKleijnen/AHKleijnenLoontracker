/** Eén dienst zoals uit de rooster-iCal geparsed. Tijden zijn lokale wandkloktijd. */
export interface Dienst {
  uid: string;
  start: Date;
  eind: Date;
  pauzeUur: number;
  afdeling: string; // SUMMARY, bijv. "Operatie"
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
