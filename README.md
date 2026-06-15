# AH Loontracker

Persoonlijke webapp die je AH-salaris berekent, voorspelt en uitsplitst op basis
van je rooster-iCal en de loon-opbouw van je loonstrook. Bruto, alle toeslagen
over het basisloon. Geen handmatig uren invullen.

## Wat het doet

- Haalt je rooster **live** uit de personeelstool-iCal (server-side, geen CORS-gedoe).
- Rekent per dienst het bruto loon uit met volledige, **uitklapbare opbouw**:
  basisloon, personeelstoeslag, zondag-/feestdag-/avondtoeslag, vakantietoeslag,
  vakantiedagen en ATV.
- Toont per **4-weken-periode**: opgebouwd tot nu, verwacht eindtotaal en de
  datum waarop het op je rekening komt (loon volgt ~1 periode later).
- Voorspelt komende periodes uit je ingeplande diensten.
- Login met één wachtwoord; je blijft ingelogd (token in localStorage).

De loon-formules reproduceren je echte loonstroken **tot op de cent**
(`npm run validate`).

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # en vul de waarden in (zie hieronder)
npm run dev                  # http://localhost:3000
```

### .env.local

```
ICAL_URL=https://ahvalkenburg.personeelstool.nl/getCalendar?hash=...
APP_PASSWORD=jouw-wachtwoord
AUTH_SECRET=<willekeurige sleutel>
```

Genereer een `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Het standaardwachtwoord in `.env.local` is nu `verander-mij` — pas dit aan.
> `.env.local`, je loonstroken (`*.pdf`) en het opgehaalde rooster (`data/`)
> staan in `.gitignore` en komen dus **niet** in GitHub.

### Controleren of de berekening klopt

```bash
npm run validate
```

## Online zetten (Vercel, gratis)

1. Push deze map naar een **(privé) GitHub-repo**.
2. Ga naar [vercel.com](https://vercel.com), "Add New… → Project", importeer de repo.
3. Zet bij **Environment Variables** dezelfde drie variabelen
   (`ICAL_URL`, `APP_PASSWORD`, `AUTH_SECRET`).
4. Deploy. Je app is daarna op je telefoon én laptop bereikbaar op dezelfde URL —
   alles is identiek omdat de data live uit de iCal komt (geen database nodig).

## Loon aanpassen

Alle loon-waarden staan ingebakken in [`src/lib/config.ts`](src/lib/config.ts).
Verandert je uurloon (verjaardag of CAO-verhoging)? Voeg een regel toe aan
`UURLOON_PER_LEEFTIJD`. Toeslag-percentages staan in `TOESLAGEN`.

## Hoe het in elkaar zit

| Bestand | Functie |
|---|---|
| `src/lib/config.ts` | Ingebakken loon-waarden (uurloon, toeslagen) |
| `src/lib/pay.ts` | Reken-engine (uren → bruto met opbouw) |
| `src/lib/periods.ts` | 4-weken periodekalender + uitbetaaldatum |
| `src/lib/holidays.ts` | Nederlandse feestdagen (+100%) |
| `src/lib/ical.ts` | Rooster-iCal parser |
| `src/lib/overview.ts` | Bouwt het overzicht voor de UI |
| `src/lib/auth.ts` | Login met één wachtwoord |
| `src/app/api/*` | API: `/api/login`, `/api/rooster` |
| `src/app/page.tsx` | Het dashboard |
| `scripts/validate.ts` | Bewijst dat de engine de loonstroken reproduceert |

## Nog te bevestigen / aannames

- **Maaltijdvergoeding** (€4,05): nu bij elke dienst met ≥30 min pauze. Exacte
  trigger nog onzeker — checken tegen een toekomstige strook.
- **Feestdagenlijst** (+100%): Nieuwjaarsdag, beide Paasdagen, Koningsdag,
  Hemelvaartsdag, beide Pinksterdagen, beide Kerstdagen, en Bevrijdingsdag
  alleen in lustrumjaren (2025, 2030, …). Een feestdag op zondag
  (1e Paas-/Pinksterdag) wint van de zondagtoeslag.
- **Uurloon 21+**: nog niet bekend;

## Later (Fase 2)

Geschiedenis voorspeld-vs-werkelijk, netto-schatting, en multi-user zodat
collega's het ook kunnen gebruiken 
Gescheidenis gewerkte dagen opslaan (dan komt er een database bij).
