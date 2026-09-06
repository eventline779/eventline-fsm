"use client";

/**
 * DeveloperModeCard — Admin-only Toggle in Mein-Konto → Sicherheit.
 *
 * Aktiviert profiles.developer_mode_enabled fuer den eingeloggten Admin.
 * Wenn AN, erscheint global das ViewAsOverlay (im (app)/layout.tsx
 * gemountet) mit dem er die Perspektive anderer Mitarbeiter simulieren
 * kann. Sicherheit dabei: waehrend aktiver Impersonation blockiert die
 * Server-Middleware alle Schreibvorgaenge — es kann nichts kaputt gehen.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { createClient } from "@/lib/supabase/client";

export function DeveloperModeCard() {
  const { profile, ready } = usePermissions();
  const supabase = createClient();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!ready || !isAdmin || !profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("developer_mode_enabled")
        .eq("id", profile.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("Developer-Mode-Status konnte nicht geladen werden");
        setEnabled(false);
        return;
      }
      setEnabled(Boolean(data?.developer_mode_enabled));
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, isAdmin, profile?.id, supabase]);

  if (!ready || !isAdmin) return null;

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/dev/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Fehler");
      setEnabled(next);
      toast.success(next ? "Developer Mode aktiviert" : "Developer Mode deaktiviert");
      // Beim Aus: Overlay ausblenden + evtl. Impersonation ist auch weg.
      // Beim An: Overlay erscheint (via Layout-Watcher).
      // Kurz reload triggern damit UI-State frisch ist.
      window.dispatchEvent(new CustomEvent("developer-mode-changed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 mt-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-500/25 dark:text-purple-200 shrink-0">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Developer Mode (View As)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Zeigt ein Overlay zum Simulieren anderer Mitarbeiter- oder Partner-Perspektiven — ohne echte Datenaenderungen.
              </p>
            </div>
            <button
              type="button"
              disabled={saving || enabled === null}
              onClick={() => toggle(!enabled)}
              aria-pressed={enabled === true}
              className="shrink-0"
              style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                position: "relative",
                background: enabled
                  ? "var(--accent)"
                  : "color-mix(in oklab, var(--foreground) 15%, transparent)",
                cursor: saving ? "wait" : "pointer",
                transition: "background 160ms ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: enabled ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: "white",
                  transition: "left 180ms cubic-bezier(0.25, 1, 0.5, 1)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                }}
              />
            </button>
          </div>
          {saving && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Wird gespeichert…
            </div>
          )}
          {enabled && !saving && (
            <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Aktiv — Overlay unten rechts</p>
              <p className="mt-0.5">
                Waehrend eine Impersonation laeuft, sind alle Schreibvorgaenge (POST/PUT/DELETE) auf dem Server geblockt. So passiert nichts in der DB.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
