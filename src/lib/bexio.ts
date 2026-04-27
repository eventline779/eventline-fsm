// Bexio-OAuth + API-Client.
//
// Singleton-Verbindung: Eine Reihe in public.bexio_connection (id=1) hält Access-
// und Refresh-Token des gemeinsamen Firma-Accounts. Alle Mitarbeiter pushen Kontakte
// ueber diesen geteilten Token — wer ihn faktisch erstellt hat, ist im Bexio-
// Audit-Log zu sehen.
//
// Wichtig: Tokens NIE an den Client schicken. Frontend ruft API-Routes auf, die
// hier die Token-Verwaltung serverseitig kapseln.

import { createAdminClient } from "@/lib/supabase/admin";

// Bexio hat den IdP von idp.bexio.com auf auth.bexio.com migriert. Beim
// Verbinden auf den alten Endpunkten gibt's 404 — auth.bexio.com ist der
// aktuelle.
const AUTH_URL = "https://auth.bexio.com/realms/bexio/protocol/openid-connect/auth";
const TOKEN_URL = "https://auth.bexio.com/realms/bexio/protocol/openid-connect/token";
const API_BASE = "https://api.bexio.com";

// Was wir mindestens brauchen: openid (OIDC), offline_access (Refresh-Token),
// contact_show + contact_edit (Lesen + Anlegen von Kontakten).
export const SCOPES = ["openid", "offline_access", "contact_show", "contact_edit"];

// Wieviele Millisekunden VOR Token-Ablauf wir refreshen — verhindert dass eine
// laufende User-Aktion mitten drin auf 401 laeuft. 60s ist der uebliche Branchen-
// Default fuer OAuth-Refresh-Buffer.
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// Bexio-Country-IDs (aus deren API-Doku). Nur die fuer uns relevanten europaeischen
// Nachbarlaender — bei Bedarf erweitern. Schluessel ist der ISO-2-Code aus unserem
// customers.country-Feld.
export const BEXIO_COUNTRY_ID: Record<string, number> = {
  CH: 1,
  DE: 2,
  AT: 3,
  FR: 4,
  IT: 5,
  LI: 6,
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

interface BexioConnection {
  id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  bexio_company_id: string | null;
  bexio_user_email: string | null;
  connected_by: string | null;
  connected_at: string;
  updated_at: string;
}

export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.BEXIO_CLIENT_ID!,
    redirect_uri: process.env.BEXIO_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.BEXIO_REDIRECT_URI!,
      client_id: process.env.BEXIO_CLIENT_ID!,
      client_secret: process.env.BEXIO_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token-Exchange fehlgeschlagen (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.BEXIO_CLIENT_ID!,
      client_secret: process.env.BEXIO_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token-Refresh fehlgeschlagen (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function saveConnection(
  tokens: TokenResponse,
  connectedBy: string | null,
  meta: { email?: string | null; companyId?: string | null }
) {
  const supabase = createAdminClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await supabase.from("bexio_connection").upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope ?? SCOPES.join(" "),
    bexio_user_email: meta.email ?? null,
    bexio_company_id: meta.companyId ?? null,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Verbindung speichern fehlgeschlagen: ${error.message}`);
}

export async function getConnection(): Promise<BexioConnection | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("bexio_connection")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return (data as BexioConnection | null) ?? null;
}

export async function disconnect(): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("bexio_connection").delete().eq("id", 1);
}

// Holt einen aktuellen access_token. Refresht automatisch wenn weniger als 60s
// vor Ablauf — so passiert kein 401-Schluckauf mitten in einer User-Aktion.
async function getValidAccessToken(): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error("Bexio ist nicht verbunden — erst in Einstellungen verbinden");

  const expiresAt = new Date(conn.expires_at).getTime();
  const now = Date.now();
  if (expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
    return conn.access_token;
  }

  const fresh = await refreshTokens(conn.refresh_token);
  const supabase = createAdminClient();
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();
  await supabase
    .from("bexio_connection")
    .update({
      access_token: fresh.access_token,
      // Bexio rotiert den Refresh-Token bei jedem Refresh — neuen speichern,
      // sonst wird der alte beim naechsten Mal abgewiesen.
      refresh_token: fresh.refresh_token ?? conn.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  return fresh.access_token;
}

async function bexioFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

// Bexio-Kontakt-Erstellung. contact_type_id: 1 = Firma, 2 = Privatperson.
// Pflichtfelder: name_1 (Firma-Name oder Nachname). name_2 ist Vorname (oder leer
// fuer Firmen). Adresse, Telefon, Mail sind optional.
export interface CreateContactInput {
  isCompany: boolean;
  name1: string;
  name2?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
}

export interface CreateContactResult {
  id: number;
  nr?: string;
}

export interface CreateContactInputWithCountry extends CreateContactInput {
  /** ISO-2-Code aus customers.address_country. Wird via BEXIO_COUNTRY_ID
   *  auf Bexio's numerische country_id gemappt. Default CH wenn leer. */
  countryCode?: string | null;
}

export async function createContact(input: CreateContactInputWithCountry): Promise<CreateContactResult> {
  const code = (input.countryCode || "CH").toUpperCase();
  const countryId = BEXIO_COUNTRY_ID[code] ?? BEXIO_COUNTRY_ID.CH;

  const payload = {
    contact_type_id: input.isCompany ? 1 : 2,
    name_1: input.name1,
    name_2: input.name2 ?? "",
    address: input.street ?? "",
    postcode: input.postcode ?? "",
    city: input.city ?? "",
    mail: input.email ?? "",
    phone_fixed: input.phone ?? "",
    country_id: countryId,
  };
  const res = await bexioFetch("/2.0/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kontakt-Anlegen fehlgeschlagen (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { id: data.id, nr: data.nr };
}

// === Search-Endpoint fuer Duplikat-Erkennung (#8) ===
//
// Vor dem Anlegen pruefen ob der Kontakt schon in Bexio existiert. Heuristik:
// 1. Email exakt -> sehr starker Match
// 2. Name (case-insensitive substring) -> moeglicher Match
// Wenn Treffer, Frontend zeigt "Verknuepfen statt anlegen?"-Modal.
//
// Bexio's /2.0/contact/search erwartet JSON-Array mit Feldern + Werten +
// Operator. Doku: https://docs.bexio.com/legacy/resources/contact/

export interface BexioContactSearchResult {
  id: number;
  nr?: string;
  name_1: string;
  name_2?: string;
  mail?: string;
  contact_type_id?: number;
  postcode?: string;
  city?: string;
}

async function bexioSearch(field: string, value: string): Promise<BexioContactSearchResult[]> {
  const res = await bexioFetch("/2.0/contact/search?limit=20", {
    method: "POST",
    body: JSON.stringify([{ field, value, criteria: "like" }]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bexio-Suche fehlgeschlagen (${res.status}): ${text}`);
  }
  return (await res.json()) as BexioContactSearchResult[];
}

/** Sucht in Bexio nach Kontakten die zur gegebenen Email/Name passen koennten.
 *  Returnt deduplizierte Liste (Email-Match first, dann Name-Match). */
export async function findMatchingContacts(opts: {
  email: string | null | undefined;
  name: string;
}): Promise<BexioContactSearchResult[]> {
  const seen = new Map<number, BexioContactSearchResult>();

  // Email zuerst — eindeutiger Match
  if (opts.email && opts.email.trim()) {
    try {
      const byEmail = await bexioSearch("mail", opts.email.trim());
      for (const c of byEmail) seen.set(c.id, c);
    } catch {
      // Wenn Email-Suche fehlschlaegt: weiter mit Name. Lieber falsch-negativ
      // als komplett blockieren.
    }
  }

  // Dann Name (kann mehr Treffer liefern, aber relevant bei fehlender Email)
  const trimmedName = opts.name.trim();
  if (trimmedName) {
    try {
      const byName = await bexioSearch("name_1", trimmedName);
      for (const c of byName) {
        if (!seen.has(c.id)) seen.set(c.id, c);
      }
    } catch {}
  }

  return Array.from(seen.values());
}

// URL zur Kontakt-Detailseite in Bexio (zum Oeffnen nach Anlegen).
export function bexioContactUrl(contactId: number): string {
  return `https://office.bexio.com/index.php/kontakt/show/id/${contactId}`;
}
