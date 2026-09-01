"use client";

/**
 * Segment-Error-Boundary fuer alle (app)-Routen (CLAUDE.md §7-Verstoss:
 * bis hier hatte NICHTS im /app-Segment einen error.tsx-Fallback). Faengt
 * unhandled Client-Runtime-Fehler ab und bietet Retry via unstable_retry
 * (Next.js 16, ersetzt das alte reset-Prop).
 *
 * Absichtlich kein Redirect / kein Reload — laufende Eingaben in Nachbar-
 * Karten sollen nicht verloren gehen.
 */

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { logError } from "@/lib/log";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logError("app-segment.error-boundary", error, { digest: error.digest });
    toast.error("Etwas ist schiefgelaufen", {
      description: error.message || "Bitte erneut versuchen.",
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 px-4 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center mb-4">
        <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
      </div>
      <h1 className="text-lg font-semibold">Etwas ist schiefgelaufen.</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Die Seite konnte nicht geladen werden. Ein erneuter Versuch loest das
        meistens.
      </p>
      {error.digest && (
        <p className="text-[11px] text-muted-foreground mt-2 font-mono">
          Ref: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="kasten kasten-red mt-6 inline-flex items-center gap-1.5"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Erneut versuchen
      </button>
    </div>
  );
}
