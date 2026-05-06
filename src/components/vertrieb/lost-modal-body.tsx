"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  lostReason: string;
  setLostReason: (r: string) => void;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function LostModalBody({ lostReason, setLostReason, onConfirm, onClose }: Props) {
  return (
    <>
      <p className="text-sm text-gray-700 dark:text-gray-300">Gib einen Grund an, warum der Auftrag verloren wurde.</p>
      <div>
        <label className="text-sm font-medium">Grund *</label>
        <textarea
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          placeholder="z.B. Zu teuer, Konkurrenz gewählt, kein Budget..."
          className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20"
          rows={3}
          autoFocus
        />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="kasten kasten-muted flex-1">Abbrechen</button>
        <button onClick={onConfirm} disabled={!lostReason.trim()} className="kasten kasten-red flex-1">
          <AlertTriangle className="h-4 w-4" />Als verloren markieren
        </button>
      </div>
    </>
  );
}
