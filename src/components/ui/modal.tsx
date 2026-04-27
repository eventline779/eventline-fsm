"use client";

// Eine zentrale Modal-Komponente fuer die ganze App.
// Vorher: 30+ inline-Modal-Pattern mit fixed inset-0, z-[60]/z-[70], backdrop-blur.
// Jeder hatte leichte Abweichungen (z-Index, Klick-Handler, Esc-Behandlung)
// — Konsistenz-Risiko. Diese Komponente kapselt:
//   * Backdrop (z-60) mit Klick-zu-Schliessen
//   * Panel (z-70) mit max-width + bg-card + Border
//   * Header mit Titel + X-Schliessen-Button (optional)
//   * Esc-Taste schliesst (wenn nicht disabled)
//   * Render via Portal an document.body — damit kein Ancestor-Stacking-Context den
//     Backdrop einschraenkt (war ein Bug bei der mobilen Sidebar).
//
// Verwendung:
//   <Modal open={...} onClose={...} title="Stornieren?">
//     <p>...</p>
//     <div className="flex gap-2 pt-2">
//       <button className="kasten kasten-muted flex-1" onClick={onClose}>Abbrechen</button>
//       <button className="kasten kasten-red flex-1" onClick={confirm}>Bestätigen</button>
//     </div>
//   </Modal>

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  /** Wird gerufen wenn Backdrop geklickt, X-Button oder Esc gedrueckt wird.
   *  Falls disabled (z.B. waehrend Saving), Schliessen ueber `closable=false` blocken. */
  onClose: () => void;
  title?: string;
  /** Header-Icon links vom Titel (z.B. <Send className="h-5 w-5 text-blue-500" />) */
  icon?: React.ReactNode;
  /** Default 'sm' (max-w-sm). 'md' fuer Formulare, 'lg' fuer breitere Inhalte. */
  size?: "sm" | "md" | "lg";
  /** Default true. Wenn false, klick auf Backdrop + Esc + X tun nichts. Fuer
   *  Saving-States verwenden, damit der User nicht versehentlich abbricht. */
  closable?: boolean;
  children: React.ReactNode;
}

const SIZE_CLASS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

export function Modal({ open, onClose, title, icon, size = "sm", closable = true, children }: ModalProps) {
  // Esc schliesst (wenn closable). Listener nur registriert solange offen,
  // damit kein Memory-Leak bei vielen Modal-Instanzen.
  useEffect(() => {
    if (!open || !closable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closable, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const handleBackdrop = () => {
    if (closable) onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-lg" onClick={handleBackdrop} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className={`bg-card rounded-2xl shadow-2xl w-full ${SIZE_CLASS[size]} overflow-hidden border`}>
          {(title || icon) && (
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                {icon}
                {title && <h2 className="font-semibold">{title}</h2>}
              </div>
              {closable && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Schliessen"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
          <div className="p-6 space-y-4">{children}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}
