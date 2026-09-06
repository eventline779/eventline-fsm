"use client";

/**
 * ViewAsOverlay — schwebendes Overlay unten rechts fuer den Developer-Mode.
 *
 * Sichtbar nur wenn:
 *   1) Eingeloggter User ist Admin, UND
 *   2) profiles.developer_mode_enabled === true
 *
 * Funktionen:
 *   - Aktuelle Impersonation anzeigen (wer wird gerade simuliert)
 *   - User-Picker zum Wechseln (gefiltert nach Rolle: Team | Partner)
 *   - Stop-Button
 *   - Warn-Banner beim Impersonieren dass Writes geblockt sind
 *
 * Nach einem Wechsel wird die Seite reloaded, damit die Server-Renders
 * die neue Perspektive liefern (RSC-Data-Fetches sowieso, Client-State
 * ist frisch dazu).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bug, ChevronUp, ChevronDown, LogOut, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Candidate {
  id: string;
  full_name: string;
  role: string;
}

interface CurrentState {
  active: boolean;
  target_user_id?: string;
  target?: { id: string; full_name: string; role: string } | null;
}

export function ViewAsOverlay() {
  const supabase = createClient();
  // Eigenes Profile-Load statt usePermissions — der Hook ist nicht in allen
  // Layouts verfuegbar (z.B. /partner hat keinen PermissionsProvider). Das
  // Overlay muss aber ueberall funktionieren, sonst kommt der impersonierende
  // Admin aus dem Partner-Portal nie wieder raus.
  const [realUserRole, setRealUserRole] = useState<string | null>(null);
  const [realUserId, setRealUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [devModeEnabled, setDevModeEnabled] = useState<boolean | null>(null);
  const [current, setCurrent] = useState<CurrentState | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"alle" | "team" | "partner">("alle");
  const [loading, setLoading] = useState(false);
  const isAdmin = realUserRole === "admin";

  // Beim Mount: hole den ECHTEN eingeloggten User + sein role/devmode-flag.
  // WICHTIG: hier NICHT effectiveUser — auch bei aktiver Impersonation muss
  // das Overlay den echten Admin identifizieren, sonst wuerde bei einem
  // impersonierten Partner das Overlay verschwinden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setReady(true); return; }
      setRealUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("role, developer_mode_enabled")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setRealUserRole((data?.role as string) ?? null);
      setDevModeEnabled(Boolean(data?.developer_mode_enabled));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!realUserId) return;
    const { data } = await supabase
      .from("profiles")
      .select("developer_mode_enabled, role")
      .eq("id", realUserId)
      .maybeSingle();
    setRealUserRole((data?.role as string) ?? realUserRole);
    setDevModeEnabled(Boolean(data?.developer_mode_enabled));
    if (data?.developer_mode_enabled) {
      const r = await fetch("/api/dev/impersonate");
      if (r.ok) setCurrent(await r.json());
    } else {
      setCurrent({ active: false });
    }
  }, [realUserId, realUserRole, supabase]);

  // Impersonation-Status beim Mount holen (falls Cookie schon gesetzt ist).
  useEffect(() => {
    if (ready && isAdmin && devModeEnabled) {
      (async () => {
        const r = await fetch("/api/dev/impersonate");
        if (r.ok) setCurrent(await r.json());
      })();
    }
  }, [ready, isAdmin, devModeEnabled]);

  // Listen for toggle-changes from settings page
  useEffect(() => {
    function onChange() { void refresh(); }
    window.addEventListener("developer-mode-changed", onChange);
    return () => window.removeEventListener("developer-mode-changed", onChange);
  }, [refresh]);

  // Load candidates when picker opens
  useEffect(() => {
    if (!open || !devModeEnabled) return;
    (async () => {
      const r = await fetch("/api/dev/impersonate/candidates");
      if (r.ok) {
        const json = (await r.json()) as { users?: Candidate[] };
        setCandidates(json.users ?? []);
      }
    })();
  }, [open, devModeEnabled]);

  const filtered = useMemo(() => {
    let list = candidates;
    if (filter === "partner") list = list.filter((u) => u.role === "partner");
    if (filter === "team") list = list.filter((u) => u.role !== "partner");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) => u.full_name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q),
      );
    }
    return list;
  }, [candidates, filter, search]);

  async function startImpersonation(targetId: string) {
    setLoading(true);
    try {
      const r = await fetch("/api/dev/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_user_id: targetId }),
      });
      const json = await r.json();
      if (!json.success) throw new Error(json.error ?? "Fehler");
      // Portal-Wechsel: Partner-User leben ausschliesslich im /partner-Portal
      // (das (app)/-Portal redirected sie eh sofort weg). Wenn wir einen
      // Partner impersonieren muss die Navigation direkt dorthin, sonst
      // landet der Admin auf dem Firmenportal und sieht 'seine' Admin-View
      // statt der Partner-Perspektive. Umgekehrt: wenn wir einen Nicht-
      // Partner impersonieren und aktuell im /partner-Portal sind, zurueck
      // zum Firmen-Dashboard.
      const targetRole = json.target?.role as string | undefined;
      const targetIsPartner = targetRole === "partner";
      const currentIsPartnerPortal = window.location.pathname.startsWith("/partner");
      if (targetIsPartner && !currentIsPartnerPortal) {
        window.location.href = "/partner/anfragen";
        return;
      }
      if (!targetIsPartner && currentIsPartnerPortal) {
        window.location.href = "/dashboard";
        return;
      }
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Wechsel");
      setLoading(false);
    }
  }

  async function stopImpersonation() {
    setLoading(true);
    try {
      await fetch("/api/dev/impersonate", { method: "DELETE" });
      // Beim Stop: wenn wir gerade im Partner-Portal sind (weil wir einen
      // Partner impersoniert hatten), zurueck zum Firmen-Dashboard —
      // sonst wuerde der Admin am Partner-Portal haengen bleiben ohne
      // Berechtigung dort etwas zu tun.
      if (window.location.pathname.startsWith("/partner")) {
        window.location.href = "/dashboard";
        return;
      }
      window.location.reload();
    } catch {
      toast.error("Beenden fehlgeschlagen");
      setLoading(false);
    }
  }

  if (!ready || !isAdmin || !devModeEnabled) return null;

  const active = current?.active === true && current?.target;

  return (
    <>
      {/* Warn-Streifen ganz oben — nur wenn aktiv impersonating. Nicht
          overlay-gebunden, damit der User immer sofort sieht dass er
          in fremder Perspektive ist (und Writes geblockt sind). */}
      {active && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1200,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            textAlign: "center",
            background:
              "color-mix(in oklab, var(--accent) 85%, black)",
            color: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          👁 View-As aktiv: du siehst als {current!.target!.full_name} ({current!.target!.role}) — Schreibvorgaenge sind geblockt.
        </div>
      )}

      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 1300,
          fontFamily: "inherit",
        }}
      >
        {open ? (
          <div
            className="rounded-2xl border shadow-2xl"
            style={{
              width: 340,
              background: "var(--card)",
              borderColor: "var(--border)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "70vh",
            }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Bug className="h-4 w-4 text-purple-500 shrink-0" />
                <span className="text-xs font-semibold truncate">Developer · View As</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-muted/60"
                aria-label="Schliessen"
              >
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            {active && (
              <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Aktuell</p>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{current!.target!.full_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{current!.target!.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={stopImpersonation}
                    disabled={loading}
                    className="kasten kasten-muted shrink-0"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                    Beenden
                  </button>
                </div>
              </div>
            )}

            <div className="px-3 py-2 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suche nach Name oder Rolle…"
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border bg-background"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div className="flex gap-1">
                {(["alle", "team", "partner"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={filter === f ? "kasten-active" : "kasten-toggle-off"}
                    style={{ flex: 1, fontSize: 10 }}
                  >
                    {f === "alle" ? "Alle" : f === "team" ? "Team" : "Partner"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6 px-3">
                  Keine User gefunden.
                </p>
              ) : (
                <ul className="p-1.5 space-y-0.5">
                  {filtered.map((u) => {
                    const isCurrent = current?.target_user_id === u.id;
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          disabled={loading || isCurrent}
                          onClick={() => startImpersonation(u.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
                          style={{
                            background: isCurrent
                              ? "color-mix(in oklab, var(--accent) 12%, transparent)"
                              : "transparent",
                            cursor: loading ? "wait" : isCurrent ? "default" : "pointer",
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrent && !loading) {
                              e.currentTarget.style.background =
                                "color-mix(in oklab, var(--foreground) 6%, transparent)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrent) {
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                        >
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: colorForRole(u.role) }}
                          >
                            {initials(u.full_name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{u.full_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{u.role}</p>
                          </div>
                          {isCurrent && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-accent">aktiv</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border transition-all hover:scale-105"
            style={{
              background: active
                ? "color-mix(in oklab, var(--accent) 85%, black)"
                : "var(--card)",
              borderColor: active ? "var(--accent)" : "var(--border)",
              color: active ? "white" : "var(--foreground)",
            }}
          >
            <Bug className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">
              {active ? `View: ${current!.target!.full_name.split(" ")[0]}` : "Dev · View As"}
            </span>
            <ChevronUp className="h-3 w-3 opacity-60" />
          </button>
        )}
      </div>
    </>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function colorForRole(role: string): string {
  const map: Record<string, string> = {
    admin: "#dc2626",
    partner: "#7c3aed",
    techniker: "#0ea5e9",
  };
  return map[role] ?? "#6b7280";
}
