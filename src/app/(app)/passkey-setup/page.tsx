"use client";

/**
 * Passkey-Enrollment (Zwangs-Setup)
 * ---------------------------------
 * Jeder interne User (role !== 'partner') braucht mindestens einen Passkey,
 * bevor er die App nutzen kann. Der Redirect hierher passiert im
 * (app)/layout, sobald das Profil geladen ist und /api/auth/passkey/list
 * eine leere Liste liefert.
 *
 * Skip gibt es bewusst nicht — die Seite hat keinen "Überspringen"-Button
 * und die einzige Escape-Luke ist "Abmelden" (oben rechts). Sobald ein
 * Passkey registriert ist, springt die Seite via router.replace ins
 * Dashboard.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasskeysCard } from "@/components/einstellungen/passkeys-card";
import { Fingerprint, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function PasskeySetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      try {
        await fetch("/api/sessions/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "logout" }),
        });
      } catch { /* best-effort */ }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push("/login");
      router.refresh();
    } catch (err) {
      setSigningOut(false);
      toast.error(
        err instanceof Error ? err.message : "Abmelden fehlgeschlagen",
      );
    }
  }

  return (
    <div className="max-w-2xl mx-auto page-enter">
      <div className="text-center space-y-3 mb-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 dark:text-red-400">
          <Fingerprint className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Biometrischer Login einrichten
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
          Für dein EVENTLINE-Konto ist ein biometrischer Login (Face-ID,
          Touch-ID, Fingerabdruck oder Windows-Hello) erforderlich.
          Registriere jetzt einen Passkey — danach kannst du dich ohne
          Passwort anmelden.
        </p>
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-card/60 p-4 mb-4 flex items-start gap-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
        <div>
          Der Passkey wird sicher auf deinem Gerät gespeichert und verlässt
          es nie. EVENTLINE sieht nur den öffentlichen Schlüssel — dein
          Fingerabdruck oder Gesicht bleibt lokal.
        </div>
      </div>

      <PasskeysCard onRegistered={() => router.replace("/dashboard")} />

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {signingOut && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {signingOut ? "Wird abgemeldet…" : "Abbrechen und abmelden"}
        </button>
      </div>
    </div>
  );
}
