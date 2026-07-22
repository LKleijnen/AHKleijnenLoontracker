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
- **Live tijdens je dienst**: zodra er een dienst loopt verschijnt bovenaan een
  teller die het verdiende bruto continu "op de cent" laat oplopen, met een
  voortgangsbalk en percentage van de dienst. Buiten een dienst is hij verborgen.
- Toont per **4-weken-periode**: opgebouwd tot nu, verwacht eindtotaal en de
  datum waarop het op je rekening komt (loon volgt ~1 periode later).
- Voorspelt komende periodes uit je ingeplande diensten.
- **Bewaart gewerkte diensten** (optioneel). De iCal bevat maar ~4 weken, dus
  elke dienst die geweest is wordt los opgeslagen (niet pas als de hele periode
  klaar is) en de afgelopen periodes worden daaruit herbouwd. Zonder account
  blijft die geschiedenis op je apparaat (localStorage); met een **optioneel
  account** (Google of e-mail/wachtwoord) wordt hij in de cloud bewaard en op al
  je apparaten gesynct. In de onboarding kun je inloggen of overslaan.
- **Handmatig diensten toevoegen** (knop in de header) voor oude diensten die
  niet (meer) in je rooster staan: datum, begin/eind, pauze en afdeling. Alleen
  in het verleden, geen overlap met bestaande diensten. Handmatige diensten
  krijgen een "handmatig"-badge en zijn met de prullenbak weer te verwijderen.

- **Demo op `/demo`** voor wie niet in de winkel werkt (portfolio/demonstratie):
  dezelfde app op een verzonnen rooster, zonder rooster-link en zonder account.
  Zie [Demo-modus](#demo-modus).

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
| `src/lib/live.ts` | Live-loon: opgebouwd bruto + % tijdens een lopende dienst |
| `src/lib/periods.ts` | 4-weken periodekalender + uitbetaaldatum |
| `src/lib/holidays.ts` | Nederlandse feestdagen (+100%) |
| `src/lib/ical.ts` | Rooster-iCal parser |
| `src/lib/overview.ts` | Bouwt het overzicht (client-side berekend) |
| `src/lib/types.ts` | Types (Dienst, RuweDienst, Loongegevens, …) |
| `src/lib/diensten.ts` | Dienst ⇄ RuweDienst (wandkloktijd, geen tijdzone) |
| `src/lib/firebase.ts` | Optionele Firebase-init (alleen als env-vars gezet zijn) |
| `src/lib/auth.ts` | `useFirebaseAuth`-hook (Google + e-mail/wachtwoord) |
| `src/lib/historie.ts` | Voorbije diensten bewaren/laden (localStorage + Firestore) |
| `src/lib/demo.ts` | Demo-modus: voorbeeldrooster + voorbeeldprofiel |
| `src/app/api/rooster` | API: haalt iCal op (per gebruiker, POST) → ruwe diensten |
| `src/app/Loontracker.tsx` | Onboarding-wizard + dashboard + account-UI |
| `src/app/page.tsx` | Route `/` — de echte app |
| `src/app/demo/page.tsx` | Route `/demo` — dezelfde app in demo-modus |
| `firestore.rules` | Beveiligingsregels: iedereen alleen bij eigen data |
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

## Geschiedenis bewaren (optioneel account via Firebase)

De account-functie is **volledig optioneel** en **gratis** (Firebase Spark-plan).
Zonder Firebase-config draait de app gewoon door en bewaart hij voorbije
periodes alleen in je browser. Wil je cloud-sync over apparaten, dan zet je een
gratis Firebase-project op:

1. Maak een project op [console.firebase.google.com](https://console.firebase.google.com/).
2. **Authentication → Sign-in method**: zet **Google** én **E-mail/wachtwoord** aan.
3. **Firestore Database** → aanmaken (productie-modus). Plak daarna de regels uit
   [`firestore.rules`](firestore.rules) onder **Rules** en publiceer.
4. **Project settings → Je apps → Web-app** toevoegen; kopieer de config-waarden.
5. Zet die in `.env.local` (zie [`.env.example`](.env.example)) — de zes
   `NEXT_PUBLIC_FIREBASE_*`-variabelen. Op Vercel dezelfde vars toevoegen.
6. **Authentication → Settings → Authorized domains**: voeg je domein toe
   (`localhost` staat er al; voeg je Vercel-domein toe voor Google-login).

Hoe het werkt: bij elk bezoek wordt elke **gewerkte dienst** (uit het iCal-venster)
opgeslagen onder zijn iCal-uid — alleen de **ruwe gegevens** (begin/eind als
wandkloktijd, pauze, afdeling), géén berekend loon. Ingelogd gaat dat naar
Firestore (`gebruikers/{uid}/diensten/{uid}`); bij je eerste login wordt bestaande
lokale geschiedenis mee omhoog gemigreerd. Het loon wordt **client-side** berekend
(`bouwOverzicht`) over de live iCal + de opgeslagen diensten samen, zodat de
historie automatisch meebeweegt als je later je schaal of geboortedatum corrigeert.

Ook je **instellingen** (geboortedatum, schaal, functiejaren, iCal-link) worden
ingelogd bewaard op `gebruikers/{uid}` (`profiel.ts`). Daardoor kun je in de
onboarding op **"Heb je al een account? Inloggen"** klikken: log je in en zijn er
opgeslagen gegevens, dan slaat de app de invulstappen over en laadt je dashboard
direct. Op een nieuw apparaat waar je nog ingelogd bent gebeurt dat automatisch.

> Let op: een dienst wordt bewaard zodra je de app opent terwijl die dienst nog
> in het ~4-weken-iCal-venster zit. Open je de app maandenlang niet, dan kan een
> dienst tussendoor uit de bron vallen voordat hij is opgeslagen.

## Demo-modus

`/demo` draait exact dezelfde app, maar met een **verzonnen rooster** in plaats
van een echte personeelstool-iCal. Bedoeld om de app te laten zien aan mensen
die niet in de winkel werken (portfolio, sollicitatie). De route is **niet
gelinkt** vanuit de app zelf — collega's zien er dus niets van.

Wat er anders is (alles in `demo.ts` + de `demo`-vlag in `Loontracker.tsx`):

- **Rooster**: `demoDiensten()` leidt ~3,7 diensten per week af uit de kalender,
  van 2 maanden terug t/m 1 maand vooruit, plus altijd één dienst die **nú
  bezig** is (een uur geleden begonnen, over een uur klaar) zodat de live-teller
  draait. De diensten zijn deterministisch uit de datum afgeleid, dus het
  rooster verspringt niet tussen bezoeken. De sjablonen raken bewust alle
  toeslagen: late diensten na 22:00, zondagen en dienstlengtes mét pauze
  (maaltijdvergoeding).
- **Onboarding**: identiek, behalve stap 3 — daar staat de uitleg over de
  iCal-link nog wél, maar zonder invulveld (de demo gebruikt hem niet). Op elke
  stap staat een **"sla de onboarding over"**-knop die een voorbeeldprofiel
  invult (schaal A, geboren 16-05-2006); die knop bestaat alleen in de demo.
- **Opslag**: niets wordt bewaard. Geen `localStorage`, geen Firestore — alle
  wijzigingen (instellingen, handmatige diensten) blijven in het geheugen van
  het tabblad en zijn na een refresh weg. De echte app op hetzelfde apparaat
  blijft daardoor volledig ongemoeid.
- **Account**: uitgeschakeld (`DEMO_AUTH`), zodat demo-bezoekers geen echt
  account aanmaken en verzonnen diensten nooit in iemands cloud belanden.

## Later (Fase 3)

Voorspeld-vs-werkelijk vergelijken, netto-schatting, en een server-side snapshot
(cron) zodat diensten ook bewaard worden als je de app even niet opent.
