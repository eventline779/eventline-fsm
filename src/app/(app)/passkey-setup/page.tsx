"use client";

/**
 * Passkey-Enrollment (Zwangs-Setup)
 * ---------------------------------
 * Jeder interne User (role !== 'partner') braucht mindestens einen Passkey,
 * bevor er die App nutzen kann. Der Redirect hierher passiert im
 * (app)/layout, sobald das Profil geladen ist und /api/auth/passkey/list
 * eine leere Liste liefert.
 *
 * Skip gibt es bewusst nicht — die Seite hat keinen "Ueberspringen"-Button
 * und die einzige Escape-Luke ist "Abmelden" (oben rechts). Sobald ein
 * Passkey registriert ist, springt die Seite via router.replace ins
 * Dashboard.
 */

import { useRouter } from "next/navigation";
import { PasskeysCard } from "@/components/einstellungen/passkeys-card";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PasskeySetupPage() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    try {
      await fetch("/api/sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "logout" }),
      });
    } catch { /* best-effort */ }
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
          Fuer dein EVENTLINE-Konto ist ein biometrischer Login (Face-ID,
          Touch-ID, Fingerabdruck oder Windows-Hello) erforderlich.
          Registriere jetzt einen Passkey — danach kannst du dich ohne
          Passwort anmelden.
        </p>
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-card/60 p-4 mb-4 flex items-start gap-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
        <div>
          Der Passkey wird sicher auf deinem Geraet gespeichert und verlaesst
          es nie. EVENTLINE sieht nur den oeffentlichen Schluessel — dein
          Fingerabdruck oder Gesicht bleibt lokal.
        </div>
      </div>

      <PasskeysCard onRegistered={() => router.replace("/dashboard")} />

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={handleSignOut}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Abbrechen und abmelden
        </button>
      </div>
    </div>
  );
}
