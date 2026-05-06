"use client";

// Hook fuer "Wirklich loeschen?"-Dialoge — Ersatz fuer browser-natives confirm().
// Nutzt die zentrale Modal-Komponente, sieht ueberall gleich aus.
//
// Verwendung:
//   const { confirm, ConfirmModalElement } = useConfirm();
//
//   async function deleteThing() {
//     const ok = await confirm({
//       title: "Wirklich loeschen?",
//       message: `"${thing.name}" wird unwiderruflich entfernt.`,
//       confirmLabel: "Loeschen",
//       variant: "red",
//     });
//     if (!ok) return;
//     // ... delete-logic
//   }
//
//   return <>{...}{ConfirmModalElement}</>;

import { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'red' (default) fuer destruktive Aktionen, 'blue' fuer Bestaetigungen. */
  variant?: "red" | "blue";
}

interface State {
  open: boolean;
  options: ConfirmOptions;
}

export function useConfirm() {
  const [state, setState] = useState<State>({
    open: false,
    options: { title: "" },
  });
  // Resolver wird gerufen sobald User bestaetigt oder abbricht.
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, options });
    });
  }, []);

  const handleClose = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const variant = state.options.variant ?? "red";
  const confirmClass = variant === "red" ? "kasten kasten-red" : "kasten kasten-blue";

  const ConfirmModalElement = (
    <Modal
      open={state.open}
      onClose={handleClose}
      title={state.options.title}
      size="sm"
    >
      {state.options.message && (
        <p className="text-sm text-muted-foreground">{state.options.message}</p>
      )}
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={handleClose} className="kasten kasten-muted flex-1">
          {state.options.cancelLabel ?? "Abbrechen"}
        </button>
        <button type="button" onClick={handleConfirm} className={`${confirmClass} flex-1`}>
          {state.options.confirmLabel ?? "Bestätigen"}
        </button>
      </div>
    </Modal>
  );

  return { confirm, ConfirmModalElement };
}
