"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PeriodeUit, DienstUit, Tarieven } from "@/lib/overview";
import { bouwOverzicht } from "@/lib/overview";
import type { Instellingen, Geboortedatum, RuweDienst, Dienst, Loongegevens } from "@/lib/types";
import { naarDienst, overlapt } from "@/lib/diensten";
import { normaliseerIcalUrl } from "@/lib/ical";
import { actieveDienst, liveLoon } from "@/lib/live";
import { SCHAAL_INFO, type Schaal } from "@/lib/config";
import { useFirebaseAuth, type FirebaseAuth } from "@/lib/auth";
import { syncHistorie, voegSamen, laadLokaal, bewaarLokaal, bewaarCloud, verwijderCloud } from "@/lib/historie";
import { laadInstellingenCloud, bewaarInstellingenCloud } from "@/lib/profiel";
import { DEMO_INSTELLINGEN, demoDiensten } from "@/lib/demo";

const AFDELINGEN = ["Operatie", "Vers", "Kassa"];

/** Verwijder-handler voor handmatige diensten, via context i.p.v. prop-drilling. */
const VerwijderDienstContext = createContext<((uid: string) => void) | null>(null);

function nieuweUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `handmatig-${crypto.randomUUID()}`;
  return `handmatig-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const OPSLAG_KEY = "loon_instellingen";

const euro = (n: number) =>
  "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uren = (n: number) =>
  n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + " u";

const klok = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "1 u 23 min", "12 min" of "<1 min" — resterende tijd van een dienst. */
function restLabel(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "<1 min";
  const u = Math.floor(min / 60);
  const m = min % 60;
  return u > 0 ? `${u} u ${m} min` : `${m} min`;
}

/**
 * Splitst een bedrag in de centen ("12,34") en twee extra, sneller tikkende
 * decimalen ("56") zodat je het geld letterlijk ziet binnenstromen.
 */
function splitsLive(n: number): { hoofd: string; extra: string } {
  const veilig = Math.max(0, n);
  const heel = Math.floor(veilig);
  const frac = veilig - heel;
  const centen = Math.floor(frac * 100);
  const extra = Math.floor(frac * 10000) % 100;
  return {
    hoofd: `${heel.toLocaleString("nl-NL")},${String(centen).padStart(2, "0")}`,
    extra: String(extra).padStart(2, "0"),
  };
}

const SCHALEN: Schaal[] = ["A", "B", "C"];

function naarISO(g: Geboortedatum): string {
  return `${g.jaar}-${String(g.maand).padStart(2, "0")}-${String(g.dag).padStart(2, "0")}`;
}
function naarGeboortedatum(iso: string): Geboortedatum | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { jaar: +m[1], maand: +m[2], dag: +m[3] };
}
function leeftijdNu(g: Geboortedatum): number {
  const nu = new Date();
  let l = nu.getFullYear() - g.jaar;
  if (nu.getMonth() + 1 < g.maand || (nu.getMonth() + 1 === g.maand && nu.getDate() < g.dag)) l--;
  return l;
}
function geldigeIcalUrl(url: string): boolean {
  // webcal:// / ical:// e.d. eerst omzetten, daarna pas valideren.
  return /^https:\/\/[^\s/]*personeelstool\.nl\//i.test(normaliseerIcalUrl(url));
}

/**
 * Vervangt `useFirebaseAuth` in de demo: de account-functie staat daar uit.
 * Een demo-bezoeker moet geen echt account aanmaken, en verzonnen diensten
 * horen nooit in iemands cloud-opslag terecht te komen.
 */
const DEMO_AUTH: FirebaseAuth = {
  beschikbaar: false,
  gebruiker: null,
  laden: false,
  inloggenGoogle: async () => {},
  inloggenEmail: async () => {},
  registrerenEmail: async () => {},
  uitloggen: async () => {},
};

/**
 * De hele app. `demo` (route /demo) draait dezelfde UI op een verzonnen
 * rooster: geen iCal, geen account, en niets wordt bewaard — alle wijzigingen
 * blijven in het geheugen van dit tabblad.
 */
export default function Loontracker({ demo = false }: { demo?: boolean }) {
  const [instellingen, setInstellingen] = useState<Instellingen | null>(null);
  const [ruwLive, setRuwLive] = useState<RuweDienst[] | null>(null);
  const [historieRuw, setHistorieRuw] = useState<RuweDienst[]>([]);
  const [historieFout, setHistorieFout] = useState("");
  const [status, setStatus] = useState<"init" | "onboarding" | "laden" | "klaar">("init");
  const [fout, setFout] = useState("");
  const [bewerken, setBewerken] = useState(false);
  const [toevoegen, setToevoegen] = useState(false);
  const [toonHistorieHint, setToonHistorieHint] = useState(false);
  const dienstKnopRef = useRef<HTMLButtonElement>(null);
  const echteAuth = useFirebaseAuth();
  const auth = demo ? DEMO_AUTH : echteAuth;

  async function haalRooster(inst: Instellingen) {
    // Demo: geen echte iCal ophalen, maar een voorbeeldrooster rond vandaag.
    if (demo) {
      setFout("");
      setRuwLive(demoDiensten());
      setStatus("klaar");
      return;
    }
    setStatus("laden");
    setFout("");
    try {
      const res = await fetch("/api/rooster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ icalUrl: inst.icalUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.fout || "Er ging iets mis");
      setRuwLive(data.diensten as RuweDienst[]);
      setStatus("klaar");
    } catch (e: any) {
      setFout(e.message || "Er ging iets mis");
      setStatus("klaar");
    }
  }

  useEffect(() => {
    // De demo begint altijd blanco: geen opgeslagen instellingen of historie
    // inlezen, zodat een bezoeker de hele onboarding doorloopt en de app van
    // dit apparaat ongemoeid blijft.
    if (demo) {
      setStatus("onboarding");
      return;
    }
    setHistorieRuw(laadLokaal()); // toon bewaarde historie meteen
    const raw = localStorage.getItem(OPSLAG_KEY);
    if (raw) {
      try {
        const inst = JSON.parse(raw) as Instellingen;
        if (inst?.icalUrl && inst?.geboortedatum && inst?.schaal) {
          setInstellingen(inst);
          haalRooster(inst);
          return;
        }
      } catch {
        /* corrupt -> opnieuw onboarden */
      }
    }
    setStatus("onboarding");
  }, []);

  // Snapshot elke voorbije dienst en laad de volledige geschiedenis (lokaal of,
  // als je ingelogd bent, uit de cloud). Draait zodra het live rooster binnen is
  // en telkens als je in-/uitlogt. Wacht tot de auth-status bekend is.
  useEffect(() => {
    // In de demo niets snapshotten: die zou het echte `loon_diensten` in
    // localStorage vervuilen met verzonnen diensten.
    if (!ruwLive || auth.laden || demo) return;
    let actief = true;
    syncHistorie(ruwLive, auth.gebruiker?.uid ?? null)
      .then((res) => {
        if (!actief) return;
        setHistorieRuw(res.diensten);
        setHistorieFout(res.cloudFout ?? "");
      })
      .catch(() => { /* historie is bijzaak — negeer */ });
    return () => { actief = false; };
  }, [ruwLive, auth.gebruiker?.uid, auth.laden]);

  // Bij inloggen: haal je opgeslagen instellingen uit de cloud zodat je de
  // onboarding kunt overslaan. Andersom: heb je lokaal wél instellingen maar de
  // cloud nog niet, bewaar ze dan voor je andere apparaten.
  useEffect(() => {
    const uid = auth.gebruiker?.uid;
    if (auth.laden || !uid) return;
    let actief = true;
    (async () => {
      try {
        const cloudInst = await laadInstellingenCloud(uid);
        if (!actief) return;
        if (cloudInst && !instellingen) {
          localStorage.setItem(OPSLAG_KEY, JSON.stringify(cloudInst));
          setInstellingen(cloudInst);
          setStatus("klaar");
          haalRooster(cloudInst);
        } else if (!cloudInst && instellingen) {
          await bewaarInstellingenCloud(uid, instellingen);
        }
      } catch {
        /* best-effort — onboarding blijft gewoon werken */
      }
    })();
    return () => { actief = false; };
    // instellingen bewust niet in deps: we reageren op in-/uitloggen, niet op
    // elke instellingen-wijziging (die schrijft `bewaar` al naar de cloud).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.gebruiker?.uid, auth.laden]);

  // Alle diensten (live + opgeslagen) als Dienst-objecten; live wint bij gelijke uid.
  const alleDiensten = useMemo<Dienst[]>(
    () => (ruwLive ? voegSamen(historieRuw, ruwLive).map(naarDienst) : []),
    [ruwLive, historieRuw],
  );

  // Loon wordt client-side berekend over live + opgeslagen diensten samen.
  // Zo beweegt ook de historie mee als je later je schaal/geboortedatum wijzigt.
  const overzicht = useMemo(() => {
    if (!ruwLive || !instellingen) return null;
    return bouwOverzicht(alleDiensten, instellingen);
  }, [ruwLive, instellingen, alleDiensten]);

  function bewaar(inst: Instellingen) {
    if (!demo) localStorage.setItem(OPSLAG_KEY, JSON.stringify(inst));
    setInstellingen(inst);
    setBewerken(false);
    haalRooster(inst);
    const uid = auth.gebruiker?.uid;
    if (uid) bewaarInstellingenCloud(uid, inst).catch(() => { /* best-effort */ });
  }

  // Na de onboarding: bewaar de instellingen én toon eenmalig de hint dat het
  // rooster maar een paar weken teruggaat en oudere diensten handmatig moeten.
  function voltooiOnboarding(inst: Instellingen) {
    bewaar(inst);
    setToonHistorieHint(true);
  }

  // Voegt een handmatige dienst toe. Geeft een foutmelding terug, of null bij succes.
  function voegDienstToe(nieuw: RuweDienst): string | null {
    const bestaande = voegSamen(historieRuw, ruwLive ?? []).map(naarDienst);
    if (overlapt(naarDienst(nieuw), bestaande)) {
      return "Er staat al een dienst op dat moment. Diensten mogen niet overlappen.";
    }
    const lijst = [...historieRuw, nieuw];
    setHistorieRuw(lijst);
    if (!demo) bewaarLokaal(lijst); // demo blijft in het geheugen
    const uid = auth.gebruiker?.uid;
    if (uid) bewaarCloud(uid, [nieuw]).catch(() => { /* best-effort */ });
    return null;
  }

  function verwijderDienst(dienstUid: string) {
    const lijst = historieRuw.filter((d) => d.uid !== dienstUid);
    setHistorieRuw(lijst);
    if (!demo) bewaarLokaal(lijst);
    const uid = auth.gebruiker?.uid;
    if (uid) verwijderCloud(uid, dienstUid).catch(() => { /* best-effort */ });
  }

  if (status === "init") return <Centraal>Laden…</Centraal>;

  if (status === "onboarding" || !instellingen) {
    return (
      <>
        {demo && <DemoBalk />}
        <Onboarding onKlaar={voltooiOnboarding} auth={auth} demo={demo} />
      </>
    );
  }

  const huidige = overzicht?.periodes.find((p) => p.isHuidig);
  const toekomst = overzicht?.periodes.filter((p) => p.isToekomst) ?? [];
  // Voorbije periodes komen uit de samengevoegde diensten (live + opgeslagen),
  // dus ze blijven zichtbaar ook nadat ze uit de ~4-weken-iCal zijn gevallen.
  const verleden = overzicht?.periodes.filter((p) => !p.isHuidig && !p.isToekomst) ?? [];

  return (
   <VerwijderDienstContext.Provider value={verwijderDienst}>
    {demo && <DemoBalk />}
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="text-xl font-bold text-ah-blue">Loontracker</h1>
          <p className="text-xs text-slate-500">Bruto · toeslagen over basisloon</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            ref={dienstKnopRef}
            onClick={() => { setToonHistorieHint(false); setToevoegen(true); }}
            className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 ${
              toonHistorieHint ? "z-50 border-ah-blue bg-white ring-2 ring-ah-blue" : "border-slate-200"
            }`}
          >
            <PlusIcoon />
            Dienst
          </button>
          <button
            onClick={() => setBewerken(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <TandwielIcoon />
            Instellingen
          </button>
        </div>
      </header>

      {status === "laden" && <Skeleton />}
      {fout && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{fout}</div>}

      {overzicht && (
        <div className="space-y-6">
          <TarievenKaart t={overzicht.tarieven} />
          <LiveKaart diensten={alleDiensten} loon={instellingen} />
          {huidige && <HuidigeKaart p={huidige} />}

          {toekomst.length > 0 && (
            <Sectie titel="Voorspelling komende periodes">
              {toekomst.map((p) => (
                <PeriodeKaart key={p.index} p={p} voorspelling />
              ))}
            </Sectie>
          )}

          {verleden.length > 0 && (
            <Sectie titel="Afgelopen periodes">
              {verleden.map((p) => (
                <PeriodeKaart key={p.index} p={p} perWeek />
              ))}
            </Sectie>
          )}

          <p className="px-1 text-xs leading-relaxed text-slate-400">
            Uren komen live uit je rooster. Bedragen zijn bruto; je krijgt loon van een
            periode pas rond het eind van de volgende periode. Maaltijdvergoeding is netto
            (onbelast) en een schatting. Loon volgens de CAO Levensmiddelenbedrijf (per 1 jan 2026).
          </p>
        </div>
      )}

      {bewerken && (
        <InstellingenModal
          huidig={instellingen}
          onOpslaan={bewaar}
          onSluit={() => setBewerken(false)}
          auth={auth}
          historieFout={historieFout}
          demo={demo}
        />
      )}

      {toevoegen && (
        <DienstToevoegenModal
          onToevoegen={voegDienstToe}
          onSluit={() => setToevoegen(false)}
        />
      )}

      {toonHistorieHint && (
        <HistorieHint anchorRef={dienstKnopRef} onSluit={() => setToonHistorieHint(false)} />
      )}
    </div>
   </VerwijderDienstContext.Provider>
  );
}

/* ---------- Demo ---------- */

/**
 * Vaste balk bovenaan in de demo, zodat niemand denkt naar echte gegevens te
 * kijken: het rooster is verzonnen en er wordt niets bewaard.
 */
function DemoBalk() {
  return (
    <div className="sticky top-0 z-30 bg-amber-400 px-4 py-2 text-center text-xs leading-relaxed text-amber-950">
      <strong className="font-bold">Demo</strong> · voorbeeldrooster rond de datum van vandaag ·
      er wordt niets opgeslagen en je hebt geen rooster-link of account nodig
    </div>
  );
}

/* ---------- Historie-hint (coach-mark na de onboarding) ---------- */

/**
 * Verschijnt eenmalig zodra de onboarding klaar is. Dimt het scherm, licht de
 * "+ Dienst"-knop uit en wijst er met een pijl naartoe: het rooster gaat maar
 * een paar weken terug, dus oudere diensten voeg je hier handmatig toe.
 */
function HistorieHint({
  anchorRef,
  onSluit,
}: {
  anchorRef: { current: HTMLButtonElement | null };
  onSluit: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function meet() {
      const el = anchorRef.current;
      if (el) setRect(el.getBoundingClientRect());
    }
    meet();
    window.addEventListener("resize", meet);
    window.addEventListener("scroll", meet, true);
    return () => {
      window.removeEventListener("resize", meet);
      window.removeEventListener("scroll", meet, true);
    };
  }, [anchorRef]);

  if (!rect) return null;

  const MARGE = 12;
  // Op smalle telefoons past 288px (w-72) niet meer naast de marges: dan krimpt
  // de kaart mee in plaats van buiten beeld te schuiven.
  const breedte = Math.min(288, window.innerWidth - 2 * MARGE);
  const knopMidden = rect.left + rect.width / 2;
  // Kaart rechts uitlijnen op de knop, maar altijd binnen het scherm houden.
  const kaartLinks = Math.min(
    window.innerWidth - MARGE - breedte,
    Math.max(MARGE, rect.right - breedte),
  );
  // Pijl boven het midden van de knop, geklemd binnen de kaart.
  const pijlLinks = Math.min(
    breedte - 32,
    Math.max(16, knopMidden - kaartLinks - 8),
  );

  return (
    <div className="fixed inset-0 z-40" onClick={onSluit}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="absolute rounded-2xl bg-white p-4 shadow-xl"
        style={{ top: rect.bottom + 14, left: kaartLinks, width: breedte }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* pijltje naar de knop */}
        <div
          className="absolute -top-2 h-4 w-4 rotate-45 bg-white"
          style={{ left: pijlLinks }}
        />
        <div className="relative space-y-2">
          <div className="text-sm font-semibold text-slate-800">
            Ouder dienst kwijt?
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Je rooster gaat maar een paar weken terug. Diensten van langer geleden staan
            hier niet automatisch in. Vul je die niet zelf aan, dan ontbreken er diensten
            van je vorige loonstrook en klopt het berekende loon niet meer met je echte
            loonstrook. Voeg ze toe met{" "}
            <span className="font-semibold text-ah-blue">+ Dienst</span> hierboven.
          </p>
          <button
            onClick={onSluit}
            className="mt-1 w-full rounded-lg bg-ah-blue px-3 py-2 text-sm font-semibold text-white hover:bg-ah-dark"
          >
            Begrepen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Onboarding (stapsgewijze wizard) ---------- */

function Onboarding({
  onKlaar,
  auth,
  demo = false,
}: {
  onKlaar: (i: Instellingen) => void;
  auth: FirebaseAuth;
  demo?: boolean;
}) {
  const [stap, setStap] = useState(1);
  const [gebISO, setGebISO] = useState("");
  const [schaal, setSchaal] = useState<Schaal | "">("");
  const [functiejaren, setFunctiejaren] = useState(0);
  const [icalUrl, setIcalUrl] = useState("");
  const [fout, setFout] = useState("");
  const [toonLogin, setToonLogin] = useState(false);

  const geb = gebISO ? naarGeboortedatum(gebISO) : null;
  const leeftijd = geb ? leeftijdNu(geb) : null;
  const toonFunctiejaren = leeftijd != null && leeftijd >= 21;

  // De account-stap is alleen zinvol als de cloud beschikbaar is én je nog niet
  // ingelogd bent (anders is inloggen al gebeurd via de knop bovenaan).
  const heeftAccountStap = auth.beschikbaar && !auth.gebruiker;
  const totaalStappen = heeftAccountStap ? 4 : 3;

  function volgende() {
    setFout("");
    if (stap === 1) {
      if (!geb) return setFout("Vul een geldige geboortedatum in.");
      if (leeftijd! < 13 || leeftijd! > 80) return setFout("Controleer je geboortedatum.");
    }
    if (stap === 2 && !schaal) return setFout("Kies je loonschaal.");
    if (stap === 3) {
      // In de demo is er geen rooster-link: die stap is alleen uitleg.
      if (!demo && !geldigeIcalUrl(icalUrl)) return setFout("Plak de https-link van personeelstool.nl.");
      if (!heeftAccountStap) return afronden();
    }
    setStap(stap + 1);
  }

  function afronden() {
    setFout("");
    if (!demo && !geldigeIcalUrl(icalUrl)) return setFout("Plak de https-link van personeelstool.nl.");
    onKlaar({
      geboortedatum: geb!,
      schaal: schaal as Schaal,
      functiejaren: toonFunctiejaren ? functiejaren : 0,
      icalUrl: demo ? "" : normaliseerIcalUrl(icalUrl),
    });
  }

  /** Alleen in de demo: meteen door met een ingevuld voorbeeldprofiel. */
  function slaOver() {
    onKlaar({ ...DEMO_INSTELLINGEN });
  }

  return (
    <Centraal>
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 shadow">
        <div className="text-center">
          <div className="text-2xl font-bold text-ah-blue">Loontracker</div>
          <div className="text-sm text-slate-500">Even instellen — dit hoeft maar één keer.</div>
        </div>

        <StapBalk huidig={stap} totaal={totaalStappen} />

        {stap === 1 && auth.beschikbaar && (
          auth.gebruiker ? (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-xs leading-relaxed text-green-700">
              Ingelogd als <strong className="break-all">{auth.gebruiker.email ?? "je account"}</strong>.
              We vonden nog geen opgeslagen gegevens — vul ze hieronder in, dan bewaren we ze in je account.
            </div>
          ) : !toonLogin ? (
            <button
              onClick={() => setToonLogin(true)}
              className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Heb je al een account? <span className="font-semibold text-ah-blue">Inloggen</span>
            </button>
          ) : (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Inloggen</span>
                <button onClick={() => setToonLogin(false)} className="text-xs text-slate-400 hover:text-slate-600">
                  sluiten
                </button>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                Log in om je opgeslagen gegevens en geschiedenis op te halen — dan hoef je niets
                opnieuw in te vullen.
              </p>
              <AccountFormulier auth={auth} />
            </div>
          )
        )}

        {stap === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Wat is je geboortedatum?</label>
            <GeboortedatumKiezer initieelISO={gebISO} onChange={setGebISO} />
            <p className="text-xs leading-relaxed text-slate-500">
              Hiermee bepalen we je uurloon: tot 21 jaar het jeugdloon, daarna het volwassen loon.
              Je gegevens blijven alleen in je eigen browser staan.
            </p>
          </div>
        )}

        {stap === 2 && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">In welke loonschaal zit je?</label>
            <SchaalKiezer waarde={schaal} onKies={setSchaal} />
            <p className="text-xs leading-relaxed text-slate-500">
              Niet zeker? Vakkenvullen is meestal <strong>schaal A</strong>, kassasluiter{" "}
              <strong>schaal B</strong> en teamleider <strong>schaal C</strong>.
            </p>
            {toonFunctiejaren && (
              <div className="space-y-1 rounded-lg bg-slate-50 p-3">
                <label className="block text-sm font-medium text-slate-700">Functiejaren (optioneel)</label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={functiejaren}
                  onChange={(e) => setFunctiejaren(Math.max(0, Math.min(5, +e.target.value || 0)))}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-ah-blue"
                />
                <p className="text-xs leading-relaxed text-slate-500">
                  Het aantal jaren dat je (vanaf je 21e) in deze functie werkt. Weet je het niet
                  zeker? Laat op 0 staan.
                </p>
              </div>
            )}
          </div>
        )}

        {stap === 3 && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Je rooster-link (iCal)</label>
            <p className="text-xs leading-relaxed text-slate-500">
              Hier haalt de app je uren vandaan. Normaal doe je dit:
            </p>
            <IcalUitleg />
            {demo ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <strong>In deze demo slaan we die stap over.</strong> Je hebt geen personeelstool-account
                nodig: je krijgt een voorbeeldrooster rond de datum van vandaag, met diensten van de
                afgelopen twee maanden, de komende maand en één dienst die nú bezig is.
              </div>
            ) : (
              <input
                type="url"
                inputMode="url"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder="https://…personeelstool.nl/…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ah-blue"
              />
            )}
          </div>
        )}

        {stap === 4 && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Bewaar je geschiedenis <span className="font-normal text-slate-400">(optioneel)</span>
            </label>
            <p className="text-xs leading-relaxed text-slate-500">
              Maak een account om je afgelopen periodes te bewaren en op al je apparaten terug te
              zien. Zonder account blijft je geschiedenis alleen op dit apparaat staan. Je kunt dit
              ook later via Instellingen doen.
            </p>
            <AccountFormulier auth={auth} onKlaar={afronden} />
          </div>
        )}

        {fout && <div className="text-sm text-red-600">{fout}</div>}

        <div className="flex items-center justify-between gap-3 pt-1">
          {stap > 1 ? (
            <button
              onClick={() => { setFout(""); setStap(stap - 1); }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              ← Vorige
            </button>
          ) : (
            <span />
          )}
          {stap < totaalStappen ? (
            <button
              onClick={volgende}
              className="rounded-lg bg-ah-blue px-5 py-2 font-semibold text-white hover:bg-ah-dark"
            >
              Volgende
            </button>
          ) : (
            <button
              onClick={afronden}
              className={
                heeftAccountStap
                  ? "rounded-lg px-5 py-2 font-medium text-slate-500 hover:bg-slate-100"
                  : "rounded-lg bg-ah-blue px-5 py-2 font-semibold text-white hover:bg-ah-dark"
              }
            >
              {heeftAccountStap ? "Overslaan" : "Klaar"}
            </button>
          )}
        </div>

        {demo && (
          <div className="border-t border-slate-100 pt-3 text-center">
            <button onClick={slaOver} className="text-sm font-semibold text-ah-blue hover:underline">
              Geen zin in invullen? Sla de onboarding over →
            </button>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Deze knop bestaat alleen in de demo. We vullen dan een voorbeeldprofiel in
              (schaal A, geboren 16 mei 2006); via Instellingen kun je alles alsnog aanpassen.
            </p>
          </div>
        )}
      </div>
    </Centraal>
  );
}

function StapBalk({ huidig, totaal }: { huidig: number; totaal: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totaal }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={`h-1.5 w-10 rounded-full ${n <= huidig ? "bg-ah-blue" : "bg-slate-200"}`}
        />
      ))}
    </div>
  );
}

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

/**
 * Geboortedatum via drie losse, ondubbelzinnige velden (dag / maand-naam / jaar).
 * Voorkomt de verwarring van het standaard datumveld (waar 16 in het maandvak
 * naar 12 klapt). Geeft een geldige "YYYY-MM-DD" door, of "" als nog onvolledig.
 */
function GeboortedatumKiezer({ initieelISO, onChange }: { initieelISO: string; onChange: (iso: string) => void }) {
  const init = naarGeboortedatum(initieelISO);
  const [dag, setDag] = useState(init ? String(init.dag) : "");
  const [maand, setMaand] = useState(init ? String(init.maand) : "");
  const [jaar, setJaar] = useState(init ? String(init.jaar) : "");

  function update(d: string, m: string, j: string) {
    setDag(d);
    setMaand(m);
    setJaar(j);
    const dn = +d, mn = +m, jn = +j;
    const geldig =
      d !== "" && m !== "" && j !== "" &&
      dn >= 1 && dn <= 31 && mn >= 1 && mn <= 12 && jn >= 1940 && jn <= 2030;
    onChange(geldig ? `${jn}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}` : "");
  }

  const veld = "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-ah-blue";
  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Dag</label>
        <input
          type="number"
          min={1}
          max={31}
          inputMode="numeric"
          placeholder="16"
          value={dag}
          onChange={(e) => update(e.target.value, maand, jaar)}
          className={veld}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Maand</label>
        <select value={maand} onChange={(e) => update(dag, e.target.value, jaar)} className={veld}>
          <option value="">—</option>
          {MAANDEN.map((nm, i) => (
            <option key={i} value={i + 1}>{nm}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Jaar</label>
        <input
          type="number"
          min={1940}
          max={2030}
          inputMode="numeric"
          placeholder="2006"
          value={jaar}
          onChange={(e) => update(dag, maand, e.target.value)}
          className={veld}
        />
      </div>
    </div>
  );
}

function SchaalKiezer({ waarde, onKies }: { waarde: Schaal | ""; onKies: (s: Schaal) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SCHALEN.map((s) => {
        const actief = waarde === s;
        return (
          <button
            key={s}
            onClick={() => onKies(s)}
            className={`rounded-lg border px-2 py-3 text-center transition ${
              actief ? "border-ah-blue bg-ah-light" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className={`text-lg font-bold ${actief ? "text-ah-blue" : "text-slate-800"}`}>{s}</div>
            <div className="text-[11px] leading-tight text-slate-500">{SCHAAL_INFO[s].voorbeeld}</div>
          </button>
        );
      })}
    </div>
  );
}

function IcalUitleg() {
  return (
    <ol className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
      <li>
        1. Ga naar{" "}
        <a
          href="https://ahvalkenburg.personeelstool.nl/login"
          target="_blank"
          rel="noreferrer"
          className="text-ah-blue underline"
        >
          personeelstool.nl
        </a>{" "}
        en log in.
      </li>
      <li>2. Klik op je initialen → <strong>Mijn gegevens</strong>.</li>
      <li>3. Ga naar <strong>Instellingen</strong>.</li>
      <li>4. Zet <strong>Kalender integratie</strong> aan en kopieer de iCal-link hierheen.</li>
    </ol>
  );
}

/* ---------- Instellingen wijzigen (compact, alles tegelijk) ---------- */

function InstellingenModal({
  huidig,
  onOpslaan,
  onSluit,
  auth,
  historieFout,
  demo = false,
}: {
  huidig: Instellingen;
  onOpslaan: (i: Instellingen) => void;
  onSluit: () => void;
  auth: FirebaseAuth;
  historieFout?: string;
  demo?: boolean;
}) {
  const [gebISO, setGebISO] = useState(naarISO(huidig.geboortedatum));
  const [schaal, setSchaal] = useState<Schaal>(huidig.schaal);
  const [functiejaren, setFunctiejaren] = useState(huidig.functiejaren);
  const [icalUrl, setIcalUrl] = useState(huidig.icalUrl);
  const [customAan, setCustomAan] = useState(!!huidig.customUurloon && huidig.customUurloon > 0);
  const [customUurloon, setCustomUurloon] = useState(
    huidig.customUurloon ? String(huidig.customUurloon).replace(".", ",") : "",
  );
  const [zondagDubbel, setZondagDubbel] = useState(!!huidig.zondagDubbel);
  const [fout, setFout] = useState("");

  const geb = naarGeboortedatum(gebISO);
  const leeftijd = geb ? leeftijdNu(geb) : null;
  const toonFunctiejaren = leeftijd != null && leeftijd >= 21;

  function opslaan() {
    setFout("");
    if (!geb) return setFout("Vul een geldige geboortedatum in.");
    if (!demo && !geldigeIcalUrl(icalUrl)) return setFout("Plak de https-link van personeelstool.nl.");
    let customBedrag: number | undefined;
    if (customAan) {
      const parsed = parseFloat(customUurloon.replace(",", "."));
      if (!isFinite(parsed) || parsed <= 0) {
        return setFout("Vul een geldig eigen basisuurloon in (bijv. 11,99).");
      }
      customBedrag = Math.round(parsed * 100) / 100;
    }
    onOpslaan({
      geboortedatum: geb,
      schaal,
      functiejaren: toonFunctiejaren ? functiejaren : 0,
      icalUrl: demo ? "" : normaliseerIcalUrl(icalUrl),
      customUurloon: customBedrag,
      zondagDubbel,
    });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ah-blue">Instellingen</h2>
          <button onClick={onSluit} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-700">Geboortedatum</label>
          <GeboortedatumKiezer initieelISO={gebISO} onChange={setGebISO} />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-700">Loonschaal</label>
          <SchaalKiezer waarde={schaal} onKies={setSchaal} />
        </div>

        {toonFunctiejaren && (
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-700">Functiejaren</label>
            <input
              type="number"
              min={0}
              max={5}
              value={functiejaren}
              onChange={(e) => setFunctiejaren(Math.max(0, Math.min(5, +e.target.value || 0)))}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-ah-blue"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-700">iCal-link</label>
          {demo ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
              In de demo komt het rooster uit voorbeelddata, dus er is geen rooster-link. In de
              echte app plak je hier de iCal-link uit je personeelstool.
            </p>
          ) : (
            <>
              <input
                type="url"
                inputMode="url"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder="https://…personeelstool.nl/…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ah-blue"
              />
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer text-ah-blue">Hoe kom ik aan mijn link?</summary>
                <div className="mt-2"><IcalUitleg /></div>
              </details>
            </>
          )}
        </div>

        {auth.beschikbaar && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <label className="block text-sm font-semibold text-slate-700">Account &amp; geschiedenis</label>
            {auth.gebruiker ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="min-w-0 text-sm text-slate-600">
                    Ingelogd als{" "}
                    <strong className="break-all">{auth.gebruiker.email ?? "je account"}</strong>
                  </span>
                  <button
                    onClick={() => auth.uitloggen()}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-200"
                  >
                    Uitloggen
                  </button>
                </div>
                {historieFout ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                    Cloud-opslag mislukt: {historieFout}. Je geschiedenis staat nog wel op dit
                    apparaat. Check of de Firestore-database bestaat en de regels uit{" "}
                    <code>firestore.rules</code> gepubliceerd zijn.
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500">
                    Je gewerkte diensten worden bewaard in je account en gesynct over je apparaten.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-slate-500">
                  Log in om je afgelopen periodes te bewaren en op al je apparaten terug te zien.
                  Zonder account blijft je geschiedenis alleen op dit apparaat.
                </p>
                <AccountFormulier auth={auth} />
              </>
            )}
          </div>
        )}

        <details className="border-t border-slate-100 pt-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700">
            <span className="text-slate-400">▸</span> Geavanceerde instellingen
          </summary>
          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={customAan}
                  onChange={(e) => setCustomAan(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-ah-blue"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-700">Eigen basisuurloon gebruiken</span>
                  <span className="block text-xs leading-relaxed text-slate-500">
                    Klopt je uurloon niet met de CAO-tabel? Vul dan zelf je bruto basisuurloon (excl.
                    toeslagen) in. Dit vervangt het loon op basis van schaal, leeftijd en functiejaren.
                  </span>
                </span>
              </label>
              {customAan && (
                <div className="flex items-center gap-2 pl-7">
                  <span className="text-sm text-slate-500">€</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customUurloon}
                    onChange={(e) => setCustomUurloon(e.target.value)}
                    placeholder="11,99"
                    className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ah-blue"
                  />
                  <span className="text-xs text-slate-400">per uur</span>
                </div>
              )}
            </div>

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={zondagDubbel}
                onChange={(e) => setZondagDubbel(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-ah-blue"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">Zondag dubbel uitbetaald</span>
                <span className="block text-xs leading-relaxed text-slate-500">
                  Zondaguren tellen dan als +100% (net als een feestdag) i.p.v. de standaard +50%.
                  Onregelmatige uren ná 22:00 blijven altijd op +50%.
                </span>
              </span>
            </label>
          </div>
        </details>

        {fout && <div className="text-sm text-red-600">{fout}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onSluit} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            Annuleren
          </button>
          <button onClick={opslaan} className="rounded-lg bg-ah-blue px-5 py-2 font-semibold text-white hover:bg-ah-dark">
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Account (inloggen / registreren) ---------- */

function AccountFormulier({ auth, onKlaar }: { auth: FirebaseAuth; onKlaar?: () => void }) {
  const [modus, setModus] = useState<"login" | "registreren">("login");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  async function probeer(actie: () => Promise<void>) {
    setFout("");
    setBezig(true);
    try {
      await actie();
      onKlaar?.();
    } catch (e: any) {
      setFout(e?.message || "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  const veld =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ah-blue";

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={bezig}
        onClick={() => probeer(() => auth.inloggenGoogle())}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <GoogleIcoon />
        Doorgaan met Google
      </button>

      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> of e-mail <span className="h-px flex-1 bg-slate-200" />
      </div>

      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="E-mailadres"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={veld}
      />
      <input
        type="password"
        autoComplete={modus === "login" ? "current-password" : "new-password"}
        placeholder="Wachtwoord"
        value={wachtwoord}
        onChange={(e) => setWachtwoord(e.target.value)}
        className={veld}
      />

      {fout && <div className="text-sm text-red-600">{fout}</div>}

      <button
        type="button"
        disabled={bezig}
        onClick={() =>
          probeer(() =>
            modus === "login"
              ? auth.inloggenEmail(email, wachtwoord)
              : auth.registrerenEmail(email, wachtwoord),
          )
        }
        className="w-full rounded-lg bg-ah-blue px-4 py-2 text-sm font-semibold text-white hover:bg-ah-dark disabled:opacity-50"
      >
        {modus === "login" ? "Inloggen" : "Account aanmaken"}
      </button>

      <button
        type="button"
        onClick={() => { setFout(""); setModus(modus === "login" ? "registreren" : "login"); }}
        className="w-full text-center text-xs text-ah-blue hover:underline"
      >
        {modus === "login" ? "Nog geen account? Maak er een aan" : "Heb je al een account? Inloggen"}
      </button>
    </div>
  );
}

/* ---------- Handmatige dienst toevoegen ---------- */

function DienstToevoegenModal({
  onToevoegen,
  onSluit,
}: {
  onToevoegen: (d: RuweDienst) => string | null;
  onSluit: () => void;
}) {
  const [datum, setDatum] = useState("");
  const [start, setStart] = useState("");
  const [eind, setEind] = useState("");
  const [pauze, setPauze] = useState(""); // minuten
  const [afdeling, setAfdeling] = useState(AFDELINGEN[0]);
  const [fout, setFout] = useState("");

  const nu = new Date();
  const vandaagISO = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;

  function opslaan() {
    setFout("");
    if (!datum || !start || !eind) return setFout("Vul datum, begintijd en eindtijd in.");
    const pauzeMin = Math.max(0, parseInt(pauze, 10) || 0);
    const nieuw: RuweDienst = {
      uid: nieuweUid(),
      start: `${datum}T${start}`,
      eind: `${datum}T${eind}`,
      pauzeUur: pauzeMin / 60,
      afdeling,
      bron: "handmatig",
    };
    const d = naarDienst(nieuw);
    if (isNaN(d.start.getTime()) || isNaN(d.eind.getTime())) return setFout("Ongeldige tijd.");
    if (d.eind.getTime() <= d.start.getTime()) return setFout("De eindtijd moet ná de begintijd liggen.");
    if (d.eind.getTime() > Date.now()) return setFout("Je kunt alleen diensten in het verleden toevoegen.");
    const duurUur = (d.eind.getTime() - d.start.getTime()) / 3600000;
    if (nieuw.pauzeUur >= duurUur) return setFout("De pauze is langer dan de dienst.");
    const err = onToevoegen(nieuw);
    if (err) return setFout(err);
    onSluit();
  }

  const veld = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ah-blue";
  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ah-blue">Dienst toevoegen</h2>
          <button onClick={onSluit} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Voeg een dienst toe die je gewerkt hebt maar niet (meer) in je rooster staat.
          Alleen diensten in het verleden; ze mogen niet overlappen met een bestaande dienst.
        </p>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-700">Datum</label>
          <input type="date" max={vandaagISO} value={datum} onChange={(e) => setDatum(e.target.value)} className={veld} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-700">Begintijd</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={veld} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-700">Eindtijd</label>
            <input type="time" value={eind} onChange={(e) => setEind(e.target.value)} className={veld} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-700">Pauze (min)</label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="30"
              value={pauze}
              onChange={(e) => setPauze(e.target.value)}
              className={veld}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-700">Afdeling</label>
            <select value={afdeling} onChange={(e) => setAfdeling(e.target.value)} className={veld}>
              {AFDELINGEN.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {fout && <div className="text-sm text-red-600">{fout}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onSluit} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            Annuleren
          </button>
          <button onClick={opslaan} className="rounded-lg bg-ah-blue px-5 py-2 font-semibold text-white hover:bg-ah-dark">
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */

/**
 * Live-teller die alleen verschijnt terwijl er een dienst loopt. Tikt een paar
 * keer per seconde zodat je het verdiende bedrag "op de cent" ziet binnenstromen,
 * met een voortgangsbalk + percentage van de dienst.
 */
function LiveKaart({ diensten, loon }: { diensten: Dienst[]; loon: Loongegevens }) {
  const [nu, setNu] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNu(new Date()), 150);
    return () => clearInterval(id);
  }, []);

  const dienst = actieveDienst(diensten, nu);
  if (!dienst) return null; // niets tonen buiten een dienst

  const live = liveLoon(dienst, loon, nu);
  const bedrag = splitsLive(live.brutoNu);
  const pct = Math.round(live.pct);

  return (
    <section className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-white shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          Nu aan het werk
        </span>
        <span className="flex items-center gap-2 text-xs opacity-90">
          {live.badge && (
            <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold">
              {live.badge}
            </span>
          )}
          {klok(live.start)}–{klok(live.eind)} · {live.afdeling}
        </span>
      </div>

      <div className="mt-3 text-xs uppercase tracking-wide opacity-80">Tot nu verdiend (bruto)</div>
      <div className="flex items-baseline font-bold tabular-nums">
        <span className="text-5xl">€ {bedrag.hoofd}</span>
        <span className="ml-0.5 text-2xl opacity-60">{bedrag.extra}</span>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-150 ease-linear"
          style={{ width: `${live.pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs opacity-90">
        <span className="font-semibold">{pct}% verdiend</span>
        <span>nog {restLabel(live.resterendMs)}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <Stat label="Verwacht deze dienst" waarde={euro(live.brutoTotaal)} />
        <Stat label="Gemiddeld per uur" waarde={euro(live.perUur)} />
      </div>

      {live.maaltijd > 0 && (
        <div className="mt-3 rounded-lg bg-white/15 px-3 py-2 text-center text-xs">
          + {euro(live.maaltijd)} maaltijdvergoeding (netto) aan het eind van je dienst
        </div>
      )}
    </section>
  );
}

function HuidigeKaart({ p }: { p: PeriodeUit }) {
  const pct = p.bruto > 0 ? Math.min(100, Math.round((p.opgebouwd / p.bruto) * 100)) : 0;
  return (
    <section className="rounded-2xl bg-ah-blue p-5 text-white shadow-lg">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium opacity-90">Deze periode</span>
        <span className="text-xs opacity-75">{p.periodeLabel}</span>
      </div>

      <div className="mt-2">
        <div className="text-xs uppercase tracking-wide opacity-75">Opgebouwd tot nu</div>
        <div className="text-4xl font-bold">{euro(p.opgebouwd)}</div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs opacity-90">
        <span>{pct}%</span>
        <span>Verwacht einde periode: {euro(p.bruto)}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Uren" waarde={uren(p.uren)} />
        <Stat label="Diensten" waarde={String(p.aantalDiensten)} />
        <Stat label="Maaltijd" waarde={euro(p.maaltijd)} />
      </div>

      <div className="mt-4 rounded-lg bg-white/15 px-3 py-2 text-center text-xs">
        Wordt uitbetaald rond <strong>{p.paydatumLabel}</strong>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer list-none text-sm font-medium opacity-90">
          ▸ Bekijk de {p.aantalDiensten} diensten
        </summary>
        <div className="mt-2 space-y-2">
          {p.diensten.map((d) => (
            <DienstRij key={d.uid} d={d} donker />
          ))}
        </div>
      </details>
    </section>
  );
}

function Stat({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="rounded-lg bg-white/15 py-2">
      <div className="text-sm font-semibold">{waarde}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-75">{label}</div>
    </div>
  );
}

function TarievenKaart({ t }: { t: Tarieven }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-slate-700">Uurloon (basis + toeslag)</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tarief label="Basis" waarde={t.uurloon} />
        <Tarief label="Zondag" waarde={t.zondag} sub={`+${Math.round(t.zondagPct * 100)}%`} />
        <Tarief label="Feestdag" waarde={t.feestdag} sub="+100%" />
      </div>

      <div className="mb-2 mt-4 text-sm font-semibold text-ah-dark">
        All-in per uur{" "}
        <span className="font-normal text-slate-400">
          incl. {t.personeelstoeslagPerUur > 0 ? "personeelstoeslag, " : ""}vakantiegeld &amp; ATV
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tarief label="Normaal" waarde={t.allIn} accent />
        <Tarief label="Zondag" waarde={t.allInZondag} accent />
        <Tarief label="Feestdag" waarde={t.allInFeestdag} accent />
      </div>
    </section>
  );
}

function Tarief({ label, waarde, sub, accent }: { label: string; waarde: number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg py-2 ${accent ? "bg-ah-light" : "bg-slate-50"}`}>
      <div className={`text-base font-bold ${accent ? "text-ah-blue" : "text-slate-800"}`}>{euro(waarde)}</div>
      <div className="text-[11px] font-medium text-slate-500">
        {label}
        {sub && <span className="text-slate-400"> {sub}</span>}
      </div>
    </div>
  );
}

function PeriodeKaart({ p, voorspelling, perWeek }: { p: PeriodeUit; voorspelling?: boolean; perWeek?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <div>
          <div className="font-semibold text-slate-800">
            {p.label} <span className="font-normal text-slate-400">· {p.periodeLabel}</span>
          </div>
          <div className="text-xs text-slate-500">
            {uren(p.uren)} · {p.aantalDiensten} diensten · uitbetaling {p.paydatumLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-ah-blue">{euro(p.bruto)}</div>
          <div className="text-[10px] uppercase text-slate-400">{voorspelling ? "voorspeld" : "bruto"}</div>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-3">
          {p.diensten.length === 0 && <div className="text-sm text-slate-400">Nog geen diensten.</div>}
          {perWeek
            ? p.weken.map((w) => (
                <div key={`${w.jaar}-${w.weeknummer}`} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Week {w.weeknummer}
                    </span>
                    <span className="text-xs text-slate-500">
                      {uren(w.uren)} · <span className="font-semibold text-slate-700">{euro(w.bruto)}</span>
                    </span>
                  </div>
                  {w.diensten.map((d) => (
                    <DienstRij key={d.uid} d={d} />
                  ))}
                </div>
              ))
            : p.diensten.map((d) => (
                <DienstRij key={d.uid} d={d} />
              ))}
        </div>
      )}
    </div>
  );
}

function DienstRij({ d, donker }: { d: DienstUit; donker?: boolean }) {
  const [open, setOpen] = useState(false);
  const verwijder = useContext(VerwijderDienstContext);
  const handmatig = d.bron === "handmatig";
  const basis = donker
    ? "bg-white/10 text-white"
    : "bg-white text-slate-800 border border-slate-200";
  return (
    <div className={`rounded-lg ${basis}`}>
      <div className="flex items-center">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center justify-between px-3 py-2 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-medium capitalize ${donker ? "" : "text-slate-700"}`}>{d.datumLabel}</span>
            <span className={`text-xs ${donker ? "opacity-80" : "text-slate-500"}`}>{d.tijd}</span>
            {d.badge && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${donker ? "bg-white/25" : "bg-ah-light text-ah-dark"}`}>
                {d.badge}
              </span>
            )}
            {handmatig && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${donker ? "bg-white/25" : "bg-amber-100 text-amber-700"}`}>
                handmatig
              </span>
            )}
          </div>
          <span className="text-sm font-semibold">{euro(d.bruto)}</span>
        </button>
        {handmatig && verwijder && (
          <button
            onClick={() => { if (confirm("Deze handmatige dienst verwijderen?")) verwijder(d.uid); }}
            className={`mr-1 shrink-0 rounded-md p-2 ${donker ? "text-white/70 hover:bg-white/15" : "text-slate-400 hover:bg-slate-100 hover:text-red-600"}`}
            title="Verwijderen"
            aria-label="Dienst verwijderen"
          >
            <PrullenbakIcoon />
          </button>
        )}
      </div>
      {open && (
        <div className={`px-3 pb-2 text-sm ${donker ? "" : "text-slate-600"}`}>
          <div className={`mb-1 text-xs ${donker ? "opacity-75" : "text-slate-400"}`}>
            {uren(d.gewerkteUren)} gewerkt · {d.afdeling}
          </div>
          <ul className="space-y-1">
            {d.regels.map((r) => (
              <li key={r.label} className="flex justify-between">
                <span className={donker ? "opacity-90" : ""}>
                  {r.label}
                  {r.toelichting && <span className={donker ? "opacity-60" : "text-slate-400"}> · {r.toelichting}</span>}
                </span>
                <span>{euro(r.bedrag)}</span>
              </li>
            ))}
            {d.maaltijd > 0 && (
              <li className={`flex justify-between ${donker ? "opacity-90" : "text-slate-500"}`}>
                <span>Maaltijdvergoeding (netto)</span>
                <span>{euro(d.maaltijd)}</span>
              </li>
            )}
          </ul>
          <div className={`mt-1 flex justify-between border-t pt-1 font-semibold ${donker ? "border-white/20" : "border-slate-200"}`}>
            <span>Bruto deze dienst</span>
            <span>{euro(d.bruto)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{titel}</h2>
      {children}
    </section>
  );
}

function Centraal({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
}

function Skeleton() {
  return <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />;
}

function PlusIcoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PrullenbakIcoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function GoogleIcoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function TandwielIcoon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
