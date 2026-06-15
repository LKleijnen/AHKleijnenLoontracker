"use client";

import { useEffect, useState } from "react";
import type { Overzicht, PeriodeUit, DienstUit, Tarieven } from "@/lib/overview";
import type { Instellingen, Geboortedatum } from "@/lib/types";
import { SCHAAL_INFO, type Schaal } from "@/lib/config";

const OPSLAG_KEY = "loon_instellingen";

const euro = (n: number) =>
  "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uren = (n: number) =>
  n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + " u";

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
  return /^https:\/\/[^\s/]*personeelstool\.nl\//i.test(url.trim());
}

export default function Page() {
  const [instellingen, setInstellingen] = useState<Instellingen | null>(null);
  const [overzicht, setOverzicht] = useState<Overzicht | null>(null);
  const [status, setStatus] = useState<"init" | "onboarding" | "laden" | "klaar">("init");
  const [fout, setFout] = useState("");
  const [bewerken, setBewerken] = useState(false);

  async function haalOverzicht(inst: Instellingen) {
    setStatus("laden");
    setFout("");
    try {
      const res = await fetch("/api/rooster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(inst),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.fout || "Er ging iets mis");
      setOverzicht(data);
      setStatus("klaar");
    } catch (e: any) {
      setFout(e.message || "Er ging iets mis");
      setStatus("klaar");
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem(OPSLAG_KEY);
    if (raw) {
      try {
        const inst = JSON.parse(raw) as Instellingen;
        if (inst?.icalUrl && inst?.geboortedatum && inst?.schaal) {
          setInstellingen(inst);
          haalOverzicht(inst);
          return;
        }
      } catch {
        /* corrupt -> opnieuw onboarden */
      }
    }
    setStatus("onboarding");
  }, []);

  function bewaar(inst: Instellingen) {
    localStorage.setItem(OPSLAG_KEY, JSON.stringify(inst));
    setInstellingen(inst);
    setBewerken(false);
    haalOverzicht(inst);
  }

  if (status === "init") return <Centraal>Laden…</Centraal>;

  if (status === "onboarding" || !instellingen) {
    return <Onboarding onKlaar={bewaar} />;
  }

  const huidige = overzicht?.periodes.find((p) => p.isHuidig);
  const toekomst = overzicht?.periodes.filter((p) => p.isToekomst) ?? [];
  const verleden = overzicht?.periodes.filter((p) => !p.isHuidig && !p.isToekomst) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="text-xl font-bold text-ah-blue">Loontracker</h1>
          <p className="text-xs text-slate-500">Bruto · toeslagen over basisloon</p>
        </div>
        <button
          onClick={() => setBewerken(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <TandwielIcoon />
          Instellingen
        </button>
      </header>

      {status === "laden" && <Skeleton />}
      {fout && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{fout}</div>}

      {overzicht && (
        <div className="space-y-6">
          <TarievenKaart t={overzicht.tarieven} />
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
        />
      )}
    </div>
  );
}

/* ---------- Onboarding (stapsgewijze wizard) ---------- */

function Onboarding({ onKlaar }: { onKlaar: (i: Instellingen) => void }) {
  const [stap, setStap] = useState(1);
  const [gebISO, setGebISO] = useState("");
  const [schaal, setSchaal] = useState<Schaal | "">("");
  const [functiejaren, setFunctiejaren] = useState(0);
  const [icalUrl, setIcalUrl] = useState("");
  const [fout, setFout] = useState("");

  const geb = gebISO ? naarGeboortedatum(gebISO) : null;
  const leeftijd = geb ? leeftijdNu(geb) : null;
  const toonFunctiejaren = leeftijd != null && leeftijd >= 21;

  function volgende() {
    setFout("");
    if (stap === 1) {
      if (!geb) return setFout("Vul een geldige geboortedatum in.");
      if (leeftijd! < 13 || leeftijd! > 80) return setFout("Controleer je geboortedatum.");
    }
    if (stap === 2 && !schaal) return setFout("Kies je loonschaal.");
    setStap(stap + 1);
  }

  function afronden() {
    setFout("");
    if (!geldigeIcalUrl(icalUrl)) return setFout("Plak de https-link van personeelstool.nl.");
    onKlaar({
      geboortedatum: geb!,
      schaal: schaal as Schaal,
      functiejaren: toonFunctiejaren ? functiejaren : 0,
      icalUrl: icalUrl.trim(),
    });
  }

  return (
    <Centraal>
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 shadow">
        <div className="text-center">
          <div className="text-2xl font-bold text-ah-blue">Loontracker</div>
          <div className="text-sm text-slate-500">Even instellen — dit hoeft maar één keer.</div>
        </div>

        <StapBalk huidig={stap} totaal={3} />

        {stap === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Wat is je geboortedatum?</label>
            <input
              type="date"
              autoFocus
              value={gebISO}
              onChange={(e) => setGebISO(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-ah-blue"
            />
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
            <IcalUitleg />
            <input
              type="url"
              inputMode="url"
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              placeholder="https://…personeelstool.nl/…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ah-blue"
            />
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
          {stap < 3 ? (
            <button
              onClick={volgende}
              className="rounded-lg bg-ah-blue px-5 py-2 font-semibold text-white hover:bg-ah-dark"
            >
              Volgende
            </button>
          ) : (
            <button
              onClick={afronden}
              className="rounded-lg bg-ah-blue px-5 py-2 font-semibold text-white hover:bg-ah-dark"
            >
              Klaar
            </button>
          )}
        </div>
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
}: {
  huidig: Instellingen;
  onOpslaan: (i: Instellingen) => void;
  onSluit: () => void;
}) {
  const [gebISO, setGebISO] = useState(naarISO(huidig.geboortedatum));
  const [schaal, setSchaal] = useState<Schaal>(huidig.schaal);
  const [functiejaren, setFunctiejaren] = useState(huidig.functiejaren);
  const [icalUrl, setIcalUrl] = useState(huidig.icalUrl);
  const [fout, setFout] = useState("");

  const geb = naarGeboortedatum(gebISO);
  const leeftijd = geb ? leeftijdNu(geb) : null;
  const toonFunctiejaren = leeftijd != null && leeftijd >= 21;

  function opslaan() {
    setFout("");
    if (!geb) return setFout("Vul een geldige geboortedatum in.");
    if (!geldigeIcalUrl(icalUrl)) return setFout("Plak de https-link van personeelstool.nl.");
    onOpslaan({
      geboortedatum: geb,
      schaal,
      functiejaren: toonFunctiejaren ? functiejaren : 0,
      icalUrl: icalUrl.trim(),
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
          <input
            type="date"
            value={gebISO}
            onChange={(e) => setGebISO(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-ah-blue"
          />
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
        </div>

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

/* ---------- Dashboard ---------- */

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
        <Tarief label="Zondag" waarde={t.zondag} sub="+50%" />
        <Tarief label="Feestdag" waarde={t.feestdag} sub="+100%" />
      </div>

      <div className="mb-2 mt-4 text-sm font-semibold text-ah-dark">
        All-in per uur{" "}
        <span className="font-normal text-slate-400">incl. personeelstoeslag, vakantiegeld &amp; ATV</span>
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
  const basis = donker
    ? "bg-white/10 text-white"
    : "bg-white text-slate-800 border border-slate-200";
  return (
    <div className={`rounded-lg ${basis}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium capitalize ${donker ? "" : "text-slate-700"}`}>{d.datumLabel}</span>
          <span className={`text-xs ${donker ? "opacity-80" : "text-slate-500"}`}>{d.tijd}</span>
          {d.badge && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${donker ? "bg-white/25" : "bg-ah-light text-ah-dark"}`}>
              {d.badge}
            </span>
          )}
        </div>
        <span className="text-sm font-semibold">{euro(d.bruto)}</span>
      </button>
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
