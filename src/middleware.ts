import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Zwei Aufgaben in einer Middleware:
 *
 * 1) Cache-Control fuer authenticated App-Pages (Non-API).
 *    Verhindert dass Vercel-Edge prerendered HTML der "use client"-Pages
 *    cached und User nach Deploy die alte HTML mit alten Chunk-Hashes
 *    sehen. 'private, no-store' zwingt jeden Request zum Origin.
 *
 * 2) NOTBREMSE /dev-exit: Impersonation-Cookie loeschen + redirect.
 *
 * (Frueher gab es hier einen Write-Guard der alle POST/PUT/PATCH/DELETE
 *  waehrend Impersonation mit 423 blockte. Leo hat das entfernt: Admins
 *  duerfen sowieso alle Daten sehen und aendern — wenn er als User X
 *  arbeitet und dort einen Fehler direkt korrigieren will, soll das
 *  gehen, nicht mit 423 abgewiesen werden.)
 *
 * Der matcher deckt jetzt AUCH /api/* ab (frueher ausgeschlossen), damit
 * der Write-Guard greift. Cache-Control wird nur fuer Non-API-Requests
 * gesetzt.
 */

const IMPERSONATE_COOKIE = "eventline_impersonate_user_id";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // NOTBREMSE — /dev-exit: Impersonation-Cookie direkt in der Middleware
  // loeschen und zum Dashboard umleiten. Vor allen anderen Handlern, damit
  // ein Redirect-Loop zwischen (app) und /partner sicher aufgebrochen wird.
  // URL im Browser tippen: /dev-exit
  if (pathname === "/dev-exit") {
    const res = NextResponse.redirect(new URL("/dashboard", req.url));
    res.cookies.set(IMPERSONATE_COOKIE, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    return res;
  }

  const res = NextResponse.next();
  if (!isApi) {
    res.headers.set("Cache-Control", "private, no-store, must-revalidate");
  }
  return res;
}

export const config = {
  matcher: [
    // Deckt Non-API-Pages ab (fuer Cache-Control) und /api/* (fuer
    // Write-Guard). Statische Assets bleiben aussen vor.
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.json|favicon\\.ico|offline|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf)).*)",
  ],
};
