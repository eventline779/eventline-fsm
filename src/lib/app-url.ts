/**
 * Single source of truth für die App-URL in E-Mail-Templates und externen
 * Verlinkungen. Vorher waren `https://eventline-fsm-usyk.vercel.app/...`
 * direkt im Code — beim Domain-Wechsel (Custom-Domain etc.) brechen sonst
 * alle Mail-Links.
 *
 * Reihenfolge der Resolution:
 *   1. NEXT_PUBLIC_APP_URL (env-var) — empfohlen, in Vercel-Project-Setting
 *   2. NEXT_PUBLIC_VERCEL_URL — Vercel-Default fuer Preview-Deployments
 *   3. localhost-Fallback fuer Dev
 */

export function appUrl(path: string = ""): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  const fromVercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  const base = fromEnv
    ? fromEnv.replace(/\/$/, "")
    : fromVercel
    ? `https://${fromVercel}`
    : "http://localhost:3000";
  if (!path) return base;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
