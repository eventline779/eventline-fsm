/**
 * Zentrale Error-/Warn-Logger. Vorher gab es viele `catch { }` ohne Logging
 * und vereinzelte `console.error()` direkt im Code — beides skaliert nicht
 * (Silent-Failures bei Mail-Sends, OAuth, Cron etc.).
 *
 * In Production werden Errors nur an `console.error` weitergereicht — sobald
 * Sentry o.ae. dazukommt, hier zentral integrieren.
 */

const isDev = process.env.NODE_ENV !== "production";

/** Loggt einen Fehler mit Context-Label. Im Dev als console.error, in Prod
 *  zumindest minimal damit Vercel-Function-Logs greifen. */
export function logError(context: string, err: unknown, extra?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  if (isDev) {
    console.error(`[${context}]`, err, extra ?? "");
  } else {
    // Production: ein-Zeilen-Format fuer Vercel-Logs
    console.error(JSON.stringify({ ctx: context, msg: message, ...extra }));
  }
}

/** Warnungen die nur in Dev nervig sind (Validation-Mismatches etc.). */
export function logWarn(context: string, message: string, extra?: Record<string, unknown>) {
  if (!isDev) return;
  console.warn(`[${context}] ${message}`, extra ?? "");
}

/** Debug-Logging — nur im Dev, in Prod komplett still. */
export function logDebug(context: string, ...args: unknown[]) {
  if (!isDev) return;
  console.log(`[${context}]`, ...args);
}
