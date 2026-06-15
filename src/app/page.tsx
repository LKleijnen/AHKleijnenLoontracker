"use client";

import { useEffect, useState } from "react";
import type { Overzicht, PeriodeUit, DienstUit } from "@/lib/overview";

const TOKEN_KEY = "loon_token";

const euro = (n: number) =>
  "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uren = (n: number) =>
  n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + " u";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [overzicht, setOverzicht] = useState<Overzicht | null>(null);
  const [status, setStatus] = useState<"init" | "login" | "laden" | "klaar">("init");
  const [fout, setFout] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");

  async function haalOverzicht(t: string) {
    setStatus("laden");
    setFout("");
    try {
      const res = await fetch("/api/rooster", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setStatus("login");
        return;
      }
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
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) {
      setToken(t);
      haalOverzicht(t);
    } else {
      setStatus("login");
    }
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setFout("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wachtwoord }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.fout || "Inloggen mislukt");
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setWachtwoord("");
      haalOverzicht(data.token);
    } catch (e: any) {
      setFout(e.message || "Inloggen mislukt");
    }
  }

  function uitloggen() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setOverzicht(null);
    setStatus("login");
  }

  if (status === "init") {
    return <Centraal>Laden…</Centraal>;
  }

  if (status === "login" || !token) {
    return (
      <Centraal>
        <form onSubmit={login} className="w-full max-w-xs space-y-4 rounded-2xl bg-white p-6 shadow">
          <div className="text-center">
            <div className="text-2xl font-bold text-ah-blue">Loontracker</div>
            <div className="text-sm text-slate-500">Log in om je salaris te zien</div>
          </div>
          <input
            type="password"
            autoFocus
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            placeholder="Wachtwoord"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-ah-blue"
          />
          {fout && <div className="text-sm text-red-600">{fout}</div>}
          <button className="w-full rounded-lg bg-ah-blue py-2 font-semibold text-white hover:bg-ah-dark">
            Inloggen
          </button>
        </form>
      </Centraal>
    );
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
        <button onClick={uitloggen} className="text-sm text-slate-500 underline">
          Uitloggen
        </button>
      </header>

      {status === "laden" && <Skeleton />}
      {fout && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{fout}</div>}

      {overzicht && (
        <div className="space-y-6">
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
                <PeriodeKaart key={p.index} p={p} />
              ))}
            </Sectie>
          )}

          <p className="px-1 text-xs leading-relaxed text-slate-400">
            Uren komen live uit je rooster. Bedragen zijn bruto; je krijgt loon van een
            periode pas rond het eind van de volgende periode. Maaltijdvergoeding is netto
            (onbelast) en een schatting.
          </p>
        </div>
      )}
    </div>
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

function PeriodeKaart({ p, voorspelling }: { p: PeriodeUit; voorspelling?: boolean }) {
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
        <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-3">
          {p.diensten.length === 0 && <div className="text-sm text-slate-400">Nog geen diensten.</div>}
          {p.diensten.map((d) => (
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
