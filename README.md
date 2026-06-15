# AH Loontracker

Webapp die je AH-salaris berekent, voorspelt en uitsplitst op basis van je
rooster-iCal en de **CAO Levensmiddelenbedrijf (LMB)** — de CAO voor
franchise- en zelfstandige supermarkten. Bruto, alle toeslagen over het
basisloon. Geen handmatig uren invullen, geen login.

Bedoeld voor iedereen die in de winkel werkt: je vult éénmalig je gegevens in
(geboortedatum, loonschaal, iCal-link), die alleen in je eigen browser blijven.

## Wat het doet

- **Onboarding in 3 stappen** bij het eerste bezoek: geboortedatum → loonschaal
  (+ functiejaren vanaf 21 jr) → iCal-link, met uitleg per stap.
- Haalt je rooster **live** uit de personeelstool-iCal (server-side, geen CORS-gedoe).
- Rekent per dienst het bruto loon uit met volledige, **uitklapbare opbouw**:
  basisloon, personeelstoeslag, zondag-/feestdag-/avondtoeslag, vakantietoeslag,
  vakantiedagen en ATV.
- Toont per **4-weken-periode**: opgebouwd tot nu, verwacht eindtotaal en de
  datum waarop het op je rekening komt (loon volgt ~1 periode later).
- Voorspelt komende periodes uit je ingeplande diensten.

Het uurloon komt uit de officiële LMB-loontabel **per 1 januari 2026** (schaal
A/B/C). Geverifieerd tegen echte loonstroken: schaal C 19 jr = €10,49, 20 jr =
€11,79 — klopt tot op de cent (`npm run validate`).

## Loonschalen (LMB)

| Schaal | Voorbeeldfunctie |
|---|---|
| A | vakkenvuller |
| B | kassasluiter |
| C | teamleider |

Tot 21 jaar geldt het jeugdloon (op leeftijd); vanaf 21 jaar telt het
functiejaar mee (0–5, schaal A heeft alleen 0/1).

## Lokaal draaien

```bash
npm install
npm run dev    # http://localhost:3000

### Controleren of de berekening klopt

```bash
npm run validate
```

## Loon aanpassen

De loontabel staat in [`src/lib/config.ts`](src/lib/config.ts) (`LOONTABEL_2026`).
Bij een nieuwe CAO-verhoging: vervang de bedragen door de nieuwe gepubliceerde
tabel (zelf %-verhogingen narekenen kan een cent afwijken door CAO-afronding).
Toeslag-percentages staan in `TOESLAGEN`.

## Hoe het in elkaar zit

| Bestand | Functie |
|---|---|
| `src/lib/config.ts` | CAO-loontabel (A/B/C) + toeslagen |
| `src/lib/pay.ts` | Reken-engine (uren + loongegevens → bruto met opbouw) |
| `src/lib/periods.ts` | 4-weken periodekalender + uitbetaaldatum |
| `src/lib/holidays.ts` | Nederlandse feestdagen (+100%) |
| `src/lib/ical.ts` | Rooster-iCal parser |
| `src/lib/overview.ts` | Bouwt het overzicht voor de UI |
| `src/lib/types.ts` | Types (Dienst, Loongegevens, Instellingen, …) |
| `src/app/api/rooster` | API: haalt iCal op (per gebruiker, POST) en rekent |
| `src/app/page.tsx` | Onboarding-wizard + dashboard |
| `scripts/validate.ts` | Bewijst dat de engine de loonstroken reproduceert |

## Nog te bevestigen / aannames

- **Maaltijdvergoeding** (€4,05): nu bij elke dienst met ≥30 min pauze. Exacte
  trigger nog onzeker — checken tegen een toekomstige strook.
- **Feestdagenlijst** (+100%): Nieuwjaarsdag, beide Paasdagen, Koningsdag,
  Hemelvaartsdag, beide Pinksterdagen, beide Kerstdagen, en Bevrijdingsdag
  alleen in lustrumjaren (2025, 2030, …). Een feestdag op zondag
  (1e Paas-/Pinksterdag) wint van de zondagtoeslag.
- **Toeslagen** (personeelstoeslag €2/u, ORT, vakantiegeld, vakantiedagen, ATV)
  zijn gelijk verondersteld voor alle medewerkers onder deze CAO.

## Later (Fase 2)

Geschiedenis voorspeld-vs-werkelijk, netto-schatting, gewerkte dagen opslaan
(dan komt er een database bij).
