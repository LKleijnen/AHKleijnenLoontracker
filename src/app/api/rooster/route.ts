import { NextResponse } from "next/server";
import { parseRooster } from "@/lib/ical";
import { naarRuw } from "@/lib/diensten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * Haalt de rooster-iCal op (server-side i.v.m. CORS) en geeft de ruwe diensten
 * terug. De loonberekening gebeurt client-side, zodat tijdzones consistent zijn
 * en loongegevens de browser niet hoeven te verlaten.
 */
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

  try {
    const res = await fetch(icalUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ fout: `Rooster ophalen mislukt (${res.status})` }, { status: 502 });
    }
    const ics = await res.text();
    const diensten = parseRooster(ics).map(naarRuw);
    return NextResponse.json({ diensten });
  } catch {
    return NextResponse.json({ fout: "Rooster ophalen mislukt" }, { status: 502 });
  }
}
