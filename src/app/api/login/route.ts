import { NextResponse } from "next/server";
import { wachtwoordKlopt, maakToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let wachtwoord = "";
  try {
    const body = await req.json();
    wachtwoord = String(body?.wachtwoord ?? "");
  } catch {
    return NextResponse.json({ fout: "Ongeldige aanvraag" }, { status: 400 });
  }
  if (!wachtwoordKlopt(wachtwoord)) {
    return NextResponse.json({ fout: "Onjuist wachtwoord" }, { status: 401 });
  }
  return NextResponse.json({ token: maakToken() });
}
