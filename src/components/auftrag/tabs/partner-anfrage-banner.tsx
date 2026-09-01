"use client";

/**
 * Partner-Anfrage-Banner — Admin-Aktion oberhalb aller Tabs.
 * Annehmen laeuft via useConfirm (Bestaetigen-Dialog), Ablehnen oeffnet
 * das Reason-Modal (in tabs/auftrag-modals.tsx).
 */

import { useState } from "react";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/use-confirm";

type Props = {
  jobId: string;
  onDecided: () => void | Promise<void>;
  onOpenReject: () => void;
};

export function PartnerAnfrageBanner({ jobId, onDecided, onOpenReject }: Props) {
  const { confirm, ConfirmModalElement } = useConfirm();
  const [busy, setBusy] = useState(false);

  async function accept() {
    const ok = await confirm({
      title: "Partner-Anfrage annehmen?",
      message:
        "Die Anfrage wird ein offener Auftrag in eurer Pipeline. Der Partner sieht den Status danach read-only und kann nichts mehr ändern.",
      confirmLabel: "Annehmen",
      variant: "blue",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/jobs/${jobId}/partner-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accept", message: "" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      toast.error(json.error ?? "Aktion fehlgeschlagen");
      return;
    }
    toast.success("Anfrage angenommen");
    window.dispatchEvent(new Event("jobs:invalidate"));
    await onDecided();
  }

  return (
    <>
      <Card className="bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Partner-Anfrage</p>
              <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                Diese Anfrage kam vom Location-Partner. Annahme = wird offener Auftrag. Ablehnung = Partner
                sieht den Grund.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="kasten kasten-green"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Annehmen
            </button>
            <button
              type="button"
              onClick={onOpenReject}
              disabled={busy}
              className="kasten kasten-red"
            >
              <XCircle className="h-3.5 w-3.5" />
              Ablehnen
            </button>
          </div>
        </CardContent>
      </Card>
      {ConfirmModalElement}
    </>
  );
}
