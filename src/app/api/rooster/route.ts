import { NextResponse } from "next/server";
import { parseRooster } from "@/lib/ical";
import { bouwOverzicht } from "@/lib/overview";
import type { Loongegevens, Geboortedatum } from "@/lib/types";
import type { Schaal } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHALEN: Schaal[] = ["A", "B", "C"];

/** Alleen https naar personeelstool.nl toestaan (mitigeert SSRF/misbruik). */
function veiligeIcalUrl(ruw: unknown): string | null {
  if (typeof ruw !== "string" || ruw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(ruw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "personeelstool.nl" && !url.hostname.endsWith(".personeelstool.nl")) return null;
  return url.toString();
}

function geldigeGeboortedatum(g: unknown): Geboortedatum | null {
  if (typeof g !== "object" || g === null) return null;
  const { jaar, maand, dag } = g as Record<string, unknown>;
  if (typeof jaar !== "number" || typeof maand !== "number" || typeof dag !== "number") return null;
  if (jaar < 1940 || jaar > 2030 || maand < 1 || maand > 12 || dag < 1 || dag > 31) return null;
  return { jaar, maand, dag };
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ fout: "Ongeldige aanvraag" }, { status: 400 });
  }

  const icalUrl = veiligeIcalUrl(body.icalUrl);
  if (!icalUrl) {
    return NextResponse.json(
      { fout: "Ongeldige iCal-link. Gebruik de https-link van personeelstool.nl." },
      { status: 400 },
    );
  }

  const geboortedatum = geldigeGeboortedatum(body.geboortedatum);
  if (!geboortedatum) {
    return NextResponse.json({ fout: "Ongeldige geboortedatum" }, { status: 400 });
  }

  const schaal = body.schaal as Schaal;
  if (!SCHALEN.includes(schaal)) {
    return NextResponse.json({ fout: "Ongeldige loonschaal" }, { status: 400 });
  }

  const functiejaren = Number.isFinite(body.functiejaren) ? Math.max(0, Math.floor(body.functiejaren as number)) : 0;
  const loon: Loongegevens = { geboortedatum, schaal, functiejaren };

  try {
    const res = await fetch(icalUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ fout: `Rooster ophalen mislukt (${res.status})` }, { status: 502 });
    }
    const ics = await res.text();
    const diensten = parseRooster(ics);
    return NextResponse.json(bouwOverzicht(diensten, loon));
  } catch {
    return NextResponse.json({ fout: "Rooster ophalen mislukt" }, { status: 502 });
  }
}
