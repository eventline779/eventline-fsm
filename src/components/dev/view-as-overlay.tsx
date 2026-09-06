"use client";

/**
 * ViewAsOverlay — dezentes, schwebendes Overlay fuer den Developer-Mode.
 *
 * Design-Prinzip: SCHLICHT und PROFESSIONELL. Kein knalliger Banner ueber
 * dem Viewport (das haben wir frueher gehabt — sah nach 'in Development'
 * aus). Stattdessen:
 *   - Nicht impersoniert: kleiner Icon-Button unten rechts, monochrom.
 *   - Impersoniert:       Eyebrow-Chip oben rechts + Icon-Button bekommt
 *                         Akzent-Kontur (aktiv-Zustand). Kein Vollbreiten-
 *                         Warnstreifen mehr.
 *   - Beim Oeffnen:       kompaktes Panel unten rechts. Suchfeld im Header,
 *                         Kandidaten-Liste gruppiert nach Team / Partner.
 *
 * Sichtbar nur wenn:
 *   1) Eingeloggter (ECHTER) User ist Admin
 *   2) profiles.developer_mode_enabled === true
 *
 * Layout-agnostisch — laedt sein Admin-Profile selbst statt via
 * usePermissions, damit es auch im /partner-Portal funktioniert (das
 * keinen PermissionsProvider hat).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, ChevronDown, LogOut, Loader2, Search, Power, Lock, Pencil } from "lucide-react";
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
  write_enabled?: boolean;
}

export function ViewAsOverlay() {
  const supabase = createClient();
  const [realUserRole, setRealUserRole] = useState<string | null>(null);
  const [realUserId, setRealUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [devModeEnabled, setDevModeEnabled] = useState<boolean | null>(null);
  const [current, setCurrent] = useState<CurrentState | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const isAdmin = realUserRole === "admin";

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

  useEffect(() => {
    function onChange() { void refresh(); }
    window.addEventListener("developer-mode-changed", onChange);
    return () => window.removeEventListener("developer-mode-changed", onChange);
  }, [refresh]);

  useEffect(() => {
    if (ready && isAdmin && devModeEnabled) {
      (async () => {
        const r = await fetch("/api/dev/impersonate");
        if (r.ok) setCurrent(await r.json());
      })();
    }
  }, [ready, isAdmin, devModeEnabled]);

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

  // Kandidaten nach Team / Partner gruppieren — statt einer Filter-Chip-Reihe.
  const { teamList, partnerList } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (u: Candidate) =>
      !q || u.full_name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    return {
      teamList: candidates.filter((u) => u.role !== "partner" && match(u)),
      partnerList: candidates.filter((u) => u.role === "partner" && match(u)),
    };
  }, [candidates, search]);

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

  /** Write-Modus fuer die aktive Impersonation ein-/ausschalten. Beim
   *  Einschalten wird eine Bestaetigung verlangt — Aenderungen landen dann
   *  echt in den Daten des impersonierten Users. */
  async function toggleWriteMode(next: boolean) {
    if (next) {
      const name = current?.target?.full_name ?? "diesen User";
      // Simpler window.confirm — schneller Weg zum expliziten OK. Kein
      // eigenes Modal noetig fuer diesen einen sicherheitsrelevanten Klick.
      const ok = window.confirm(
        `Bearbeitung aktivieren?\n\nDu machst dann echte Änderungen im Namen von ${name}. Alle Aktionen werden in der DB gespeichert und sind nicht rückgängig zu machen.`,
      );
      if (!ok) return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/dev/impersonate/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = (await r.json()) as { success?: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Fehler");
      setCurrent((c) => (c ? { ...c, write_enabled: next } : c));
      toast.success(next ? "Bearbeitung aktiviert" : "Nur-Lesen-Modus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  /** Developer Mode komplett ausschalten — auch von hier aus, damit der
   *  Admin nicht zurueck in die Team-Einstellungen navigieren muss. Server
   *  loescht dabei auch das Impersonation-Cookie (siehe /api/dev/toggle).
   *  Danach: reload damit Overlay + evtl. Portal-Zustand sauber sind. */
  async function disableDevMode() {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Fehler");
      if (window.location.pathname.startsWith("/partner")) {
        window.location.href = "/dashboard";
        return;
      }
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
      setLoading(false);
    }
  }

  if (!ready || !isAdmin || !devModeEnabled) return null;

  const active = current?.active === true && current?.target;

  return (
    <>
      {/* Statuszeile oben rechts — schlanker Chip, kein Full-Width-Banner.
          Nur sichtbar wenn wirklich impersoniert wird. */}
      {active && (
        <div
          style={{
            position: "fixed",
            top: 10,
            right: 14,
            zIndex: 1400,
            pointerEvents: "none",
          }}
        >
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider shadow-sm"
            style={{
              background: current!.write_enabled
                ? "color-mix(in oklab, var(--card) 88%, #dc2626)"
                : "color-mix(in oklab, var(--card) 92%, var(--accent))",
              color: current!.write_enabled ? "#dc2626" : "var(--accent)",
              border: `1px solid ${current!.write_enabled
                ? "color-mix(in oklab, #dc2626 55%, transparent)"
                : "color-mix(in oklab, var(--accent) 45%, transparent)"}`,
              backdropFilter: "blur(6px)",
            }}
          >
            {current!.write_enabled ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>
              als {current!.target!.full_name}
              {current!.target!.role === "partner" ? " · Partner" : ""}
              {current!.write_enabled ? " · Bearbeitung" : " · nur lesen"}
            </span>
          </div>
        </div>
      )}

      {/* Floating Panel unten rechts. Zu = kleiner Icon-Button (kein Text
          im idle-Zustand, damit es dezent bleibt); auf = Panel. */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 1300,
        }}
      >
        {open ? (
          <div
            className="rounded-xl shadow-xl overflow-hidden flex flex-col"
            style={{
              width: 320,
              maxHeight: "min(72vh, 540px)",
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
                style={{
                  background: active
                    ? "color-mix(in oklab, var(--accent) 15%, transparent)"
                    : "color-mix(in oklab, var(--foreground) 8%, transparent)",
                  color: active ? "var(--accent)" : "var(--muted-foreground)",
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-semibold flex-1 min-w-0">
                View-As
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schliessen"
                className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Current-Status */}
            {active ? (
              <div
                className="border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Aktuell simuliert
                    </p>
                    <p className="text-sm font-medium truncate">
                      {current!.target!.full_name}
                      <span className="text-muted-foreground font-normal ml-1.5">
                        · {current!.target!.role}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={stopImpersonation}
                    disabled={loading}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      background: "transparent",
                      cursor: loading ? "wait" : "pointer",
                    }}
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                    Beenden
                  </button>
                </div>
                {/* Read-Only vs Bearbeitung — expliziter Toggle. Default:
                    read-only. Enable braucht Confirm. */}
                <div className="px-3 pb-2.5">
                  <button
                    type="button"
                    onClick={() => toggleWriteMode(!current!.write_enabled)}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors"
                    style={{
                      borderColor: current!.write_enabled
                        ? "color-mix(in oklab, #dc2626 55%, transparent)"
                        : "var(--border)",
                      background: current!.write_enabled
                        ? "color-mix(in oklab, #dc2626 10%, transparent)"
                        : "color-mix(in oklab, var(--foreground) 3%, transparent)",
                      color: current!.write_enabled ? "#dc2626" : "var(--foreground)",
                      cursor: loading ? "wait" : "pointer",
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {current!.write_enabled ? (
                        <Pencil className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                      {current!.write_enabled ? "Bearbeitung aktiv" : "Nur Lesen"}
                    </span>
                    <span className="text-[10px] opacity-75">
                      {current!.write_enabled ? "sperren" : "aktivieren"}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="px-3 py-2 border-b text-[11px] text-muted-foreground"
                style={{ borderColor: "var(--border)" }}
              >
                Wähle einen Mitarbeiter zum Simulieren.
              </div>
            )}

            {/* Suche */}
            <div
              className="px-3 py-2 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="relative">
                <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suchen…"
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-transparent focus:outline-none focus:ring-1"
                  style={{
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>

            {/* Kandidaten — gruppiert nach Team / Partner */}
            <div className="overflow-y-auto flex-1">
              {teamList.length === 0 && partnerList.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-8">
                  Keine Einträge.
                </p>
              ) : (
                <div className="py-1.5">
                  {teamList.length > 0 && (
                    <CandidateGroup
                      label="Team"
                      users={teamList}
                      currentId={current?.target_user_id ?? null}
                      loading={loading}
                      onPick={startImpersonation}
                    />
                  )}
                  {partnerList.length > 0 && (
                    <CandidateGroup
                      label="Partner"
                      users={partnerList}
                      currentId={current?.target_user_id ?? null}
                      loading={loading}
                      onPick={startImpersonation}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Footer — Developer Mode direkt vom Panel aus komplett
                ausschalten. Kein Umweg ueber die Team-Einstellungen. */}
            <div
              className="px-3 py-2 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={disableDevMode}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors"
                style={{
                  color: "#dc2626",
                  background: "transparent",
                  cursor: loading ? "wait" : "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "color-mix(in oklab, #dc2626 10%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                Developer Mode ausschalten
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="View-As öffnen"
            className="inline-flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-full shadow-md transition-all hover:shadow-lg"
            style={{
              background: "var(--card)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              color: active ? "var(--accent)" : "var(--foreground)",
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">
              {active ? current!.target!.full_name.split(" ")[0] : "View-As"}
            </span>
          </button>
        )}
      </div>
    </>
  );
}

function CandidateGroup({
  label,
  users,
  currentId,
  loading,
  onPick,
}: {
  label: string;
  users: Candidate[];
  currentId: string | null;
  loading: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="pb-1">
      <p className="px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/70">
        {label} · {users.length}
      </p>
      <ul>
        {users.map((u) => {
          const isCurrent = currentId === u.id;
          return (
            <li key={u.id}>
              <button
                type="button"
                disabled={loading || isCurrent}
                onClick={() => onPick(u.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                style={{
                  background: isCurrent
                    ? "color-mix(in oklab, var(--accent) 10%, transparent)"
                    : "transparent",
                  cursor: loading ? "wait" : isCurrent ? "default" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent && !loading) {
                    e.currentTarget.style.background =
                      "color-mix(in oklab, var(--foreground) 5%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0"
                  style={{
                    background: "color-mix(in oklab, var(--foreground) 10%, transparent)",
                    color: "var(--foreground)",
                  }}
                >
                  {initials(u.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate leading-tight">{u.full_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{u.role}</p>
                </div>
                {isCurrent && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-accent shrink-0">aktiv</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
