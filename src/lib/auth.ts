/**
 * Minimale login met één wachtwoord. Geen database, geen account.
 * Wachtwoord en geheime sleutel komen uit env-vars.
 * Na login wordt een HMAC-ondertekend token gemaakt dat de client in
 * localStorage bewaart (persistente sessie).
 */
import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "dev-secret-niet-voor-productie";
const MAX_LEEFTIJD_MS = 1000 * 60 * 60 * 24 * 90; // 90 dagen geldig

function veiligGelijk(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function wachtwoordKlopt(invoer: string): boolean {
  const pw = process.env.APP_PASSWORD || "";
  return pw.length > 0 && veiligGelijk(invoer, pw);
}

export function maakToken(): string {
  const body = Buffer.from(JSON.stringify({ iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function tokenGeldig(token?: string | null): boolean {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const verwacht = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (!veiligGelijk(sig, verwacht)) return false;
  try {
    const { iat } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof iat === "number" && Date.now() - iat < MAX_LEEFTIJD_MS;
  } catch {
    return false;
  }
}

export function tokenUitHeader(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
