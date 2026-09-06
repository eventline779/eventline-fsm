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
 * 2) Write-Guard fuer Developer-Mode / View-As.
 *    Wenn der Impersonation-Cookie gesetzt ist, blockiert die Middleware
 *    ALLE mutierenden HTTP-Methoden (POST/PUT/PATCH/DELETE) — sonst
 *    koennte der Admin waehrend Impersonation echte Daten des simulierten
 *    Users veraendern. Nur die Impersonation-Steuer-Endpoints selbst
 *    bleiben schreibbar (sonst kaeme man nicht mehr raus).
 *
 * Der matcher deckt jetzt AUCH /api/* ab (frueher ausgeschlossen), damit
 * der Write-Guard greift. Cache-Control wird nur fuer Non-API-Requests
 * gesetzt.
 */

const IMPERSONATE_COOKIE = "eventline_impersonate_user_id";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Endpoints die auch WAEHREND Impersonation schreiben duerfen:
//   - /api/dev/impersonate (stop/switch selber)
//   - /api/auth/* (nicht ausschliessen — Login/Logout darf immer)
const WRITE_ALLOWLIST = [
  "/api/dev/impersonate",
  "/api/auth/",
];

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

  // Write-Guard: nur fuer API + mutierende Methoden + wenn Cookie gesetzt.
  if (isApi && WRITE_METHODS.has(req.method)) {
    const impersonating = req.cookies.get(IMPERSONATE_COOKIE)?.value;
    if (impersonating) {
      const allowed = WRITE_ALLOWLIST.some((p) => pathname.startsWith(p));
      if (!allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "Im Developer-Mode gesperrt (View-As aktiv) — Aenderungen werden nicht in die DB geschrieben. Impersonation beenden um wieder zu schreiben.",
            code: "developer_mode_write_blocked",
          },
          { status: 423 }, // 423 Locked
        );
      }
    }
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
