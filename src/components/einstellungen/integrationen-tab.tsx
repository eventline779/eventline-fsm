"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Plug, X, Copy, Check } from "lucide-react";
import { useConfirm } from "@/components/ui/use-confirm";
import { createClient } from "@/lib/supabase/client";

export function IntegrationenTab() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{ connected: boolean; connectedAt?: string; bexioEmail?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [icalUrl, setIcalUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const { confirm, ConfirmModalElement } = useConfirm();

  // iCal-URL ist pro User unterschiedlich — der calendar_feed_token aus
  // dem profile kommt als ?token=... in der URL. Ohne Token kriegt der
  // Endpoint einen 401. Token wird beim Anlegen des Profils per Default
  // automatisch generiert (Migration 066).
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("calendar_feed_token")
        .eq("id", user.id)
        .maybeSingle();
      const token = profile?.calendar_feed_token;
      if (token) {
        setIcalUrl(`${window.location.origin}/api/calendar.ics?token=${token}`);
      }
    })();
  }, [supabase]);

  async function copyIcalUrl() {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("URL kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  }

  // OAuth-Rueckkehr: ?bexio=connected oder ?bexio=error&msg=...
  useEffect(() => {
    const result = searchParams.get("bexio");
    const msg = searchParams.get("msg");
    if (result === "connected") {
      toast.success("Bexio verbunden");
    } else if (result === "error") {
      toast.error("Bexio-Verbindung fehlgeschlagen" + (msg ? `: ${msg}` : ""));
    }
  }, [searchParams]);

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/bexio/status");
      const json = await res.json();
      setStatus(json);
    } catch {
      setStatus({ connected: false });
    }
    setLoading(false);
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: "Bexio trennen?",
      message: "Du musst danach neu verbinden, um Kontakte anzulegen.",
      confirmLabel: "Trennen",
      variant: "red",
    });
    if (!ok) return;
    setDisconnecting(true);
    await fetch("/api/bexio/disconnect", { method: "POST" });
    setDisconnecting(false);
    toast.success("Bexio getrennt");
    loadStatus();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Verknüpfe Eventline mit externen Tools — z.B. Bexio für Kontaktverwaltung
          oder Google Calendar für persönliche Terminübersicht.
        </p>
      </div>

      {/* Google Calendar — iCal-Feed-URL. User kopiert die URL und fuegt
          sie in Google Calendar via "Anderer Kalender → Per URL hinzufuegen"
          ein. Google synced dann automatisch alle Auftraege + Termine. */}
      <Card className="bg-card border-gray-100">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-red-500 flex items-center justify-center text-white font-bold shrink-0">
              G
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">Mein Kalender (iCal-Feed)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dein <strong>persönlicher</strong> Kalender-Feed. Enthält nur Aufträge + Termine die dir
                zugewiesen sind (Admin sieht alle). Kopiere die URL und füge sie in Google Calendar / Apple
                Calendar / Outlook über <span className="font-medium">&quot;Per URL hinzufügen&quot;</span> ein.
                <br />
                <span className="text-amber-700 dark:text-amber-400">
                  Diese URL enthält dein persönliches Token — nicht weitergeben.
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={icalUrl}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-lg border bg-muted/40 truncate focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              type="button"
              onClick={copyIcalUrl}
              disabled={!icalUrl}
              className={`kasten ${copied ? "kasten-green" : "kasten-blue"}`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-gray-100">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold shrink-0">
                B
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Bexio</h3>
                  {loading ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : status?.connected ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      Verbunden
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300">
                      <AlertCircle className="h-3 w-3" />
                      Nicht verbunden
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Kunden direkt in Bexio anlegen — der "In Bexio anlegen"-Button erscheint dann auf jeder Kunden-Detailseite.
                </p>
                {status?.connected && status.connectedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Verbunden seit {new Date(status.connectedAt).toLocaleString("de-CH", { timeZone: "Europe/Zurich" })}
                    {status.bexioEmail && <> · {status.bexioEmail}</>}
                  </p>
                )}
              </div>
            </div>
            <div className="shrink-0">
              {loading ? null : status?.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="kasten kasten-muted"
                >
                  <X className="h-3.5 w-3.5" />
                  {disconnecting ? "Trenne…" : "Trennen"}
                </button>
              ) : (
                <a href="/api/bexio/connect" className="kasten kasten-bexio">
                  <Plug className="h-3.5 w-3.5" />
                  Verbinden
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {ConfirmModalElement}
    </div>
  );
}
