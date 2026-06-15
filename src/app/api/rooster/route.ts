import { NextResponse } from "next/server";
import { tokenGeldig, tokenUitHeader } from "@/lib/auth";
import { parseRooster } from "@/lib/ical";
import { bouwOverzicht } from "@/lib/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = tokenUitHeader(req.headers.get("authorization"));
  if (!tokenGeldig(token)) {
    return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });
  }

  const url = process.env.ICAL_URL;
  if (!url) {
    return NextResponse.json({ fout: "ICAL_URL ontbreekt in de serverconfig" }, { status: 500 });
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ fout: `Rooster ophalen mislukt (${res.status})` }, { status: 502 });
    }
    const ics = await res.text();
    const diensten = parseRooster(ics);
    return NextResponse.json(bouwOverzicht(diensten));
  } catch (e) {
    return NextResponse.json({ fout: "Rooster ophalen mislukt" }, { status: 502 });
  }
}
