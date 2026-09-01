"use client";

/**
 * Auftrag-Detail: Modale (Stornieren zweiphasig, Partner-Anfrage ablehnen).
 *
 * Beide Modale nutzen `Modal` + Kasten-Buttons und lesen ihren Zustand +
 * Callbacks vom Parent. Sie stehen bewusst zusammen in einem File, weil
 * sie visuell / logisch die "destruktiven Bestaetigungen" der Detail-Seite
 * abdecken.
 */

import { Modal } from "@/components/ui/modal";

type CancelPhase = "closed" | "confirm" | "reason";

type Props = {
  jobNumber: string | number | null;
  jobTitle: string;

  // Stornieren
  cancelPhase: CancelPhase;
  cancelReason: string;
  cancelSaving: boolean;
  onCancelClose: () => void;
  onSetCancelPhase: (p: CancelPhase) => void;
  onSetCancelReason: (v: string) => void;
  onConfirmCancel: () => void | Promise<void>;

  // Partner-Anfrage ablehnen
  partnerRejectOpen: boolean;
  partnerRejectReason: string;
  partnerDecisionBusy: boolean;
  onPartnerRejectClose: () => void;
  onSetPartnerRejectReason: (v: string) => void;
  onPartnerReject: (reason: string) => void | Promise<void>;
};

export function AuftragModals({
  jobNumber,
  jobTitle,
  cancelPhase,
  cancelReason,
  cancelSaving,
  onCancelClose,
  onSetCancelPhase,
  onSetCancelReason,
  onConfirmCancel,
  partnerRejectOpen,
  partnerRejectReason,
  partnerDecisionBusy,
  onPartnerRejectClose,
  onSetPartnerRejectReason,
  onPartnerReject,
}: Props) {
  return (
    <>
      {/* Partner-Anfrage ablehnen — Reason-Modal */}
      <Modal
        open={partnerRejectOpen}
        onClose={onPartnerRejectClose}
        title="Anfrage ablehnen?"
        closable={!partnerDecisionBusy}
      >
        <p className="text-sm text-muted-foreground">
          Der Partner sieht den Grund als Erklärung in seinem Portal.
        </p>
        <textarea
          placeholder="z.B. Datum nicht verfügbar, Personalmangel…"
          value={partnerRejectReason}
          onChange={(e) => onSetPartnerRejectReason(e.target.value)}
          rows={3}
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring/40"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPartnerRejectClose}
            disabled={partnerDecisionBusy}
            className="kasten kasten-muted flex-1"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onPartnerReject(partnerRejectReason.trim())}
            disabled={partnerDecisionBusy || !partnerRejectReason.trim()}
            className="kasten kasten-red flex-1"
          >
            {partnerDecisionBusy ? "Speichere…" : "Ablehnen"}
          </button>
        </div>
      </Modal>

      {/* Stornieren-Flow: Phase 'confirm' -> 'reason' */}
      <Modal
        open={cancelPhase !== "closed"}
        onClose={onCancelClose}
        title={cancelPhase === "confirm" ? "Auftrag stornieren?" : "Grund angeben"}
        closable={!cancelSaving}
      >
        <p className="text-sm text-muted-foreground">
          {jobNumber ? `INT-${jobNumber} — ` : ""}
          <span className="font-medium text-foreground">&quot;{jobTitle}&quot;</span>
        </p>
        {cancelPhase === "confirm" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Der Auftrag wird als storniert markiert. Du kannst ihn im Archiv wieder einsehen.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSetCancelPhase("closed")}
                className="kasten kasten-muted flex-1"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => onSetCancelPhase("reason")}
                className="kasten kasten-red flex-1"
              >
                Stornieren
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Bitte gib einen Grund an, warum dieser Auftrag storniert wird.
            </p>
            <textarea
              placeholder="z.B. Kunde hat abgesagt, Termin verschoben…"
              value={cancelReason}
              onChange={(e) => onSetCancelReason(e.target.value)}
              rows={3}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSetCancelPhase("confirm")}
                disabled={cancelSaving}
                className="kasten kasten-muted flex-1"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={onConfirmCancel}
                disabled={cancelSaving || !cancelReason.trim()}
                className="kasten kasten-red flex-1"
              >
                {cancelSaving ? "Storniere…" : "Bestätigen"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
