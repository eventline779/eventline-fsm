"use client";

// Wiederverwendbarer Bexio-Button + Match-Modal.
// Verwendung auf Kunden-Detail- UND Auftrag-Detail-Seite.
//
// Drei Zustaende:
// 1. Kein bexio_contact_id -> "In Bexio anlegen" (gruen). Klick startet Search.
//    a) Match gefunden -> Modal "Existierender Kontakt gefunden — verknuepfen?"
//    b) Kein Match -> direkt anlegen, ID speichern, Tab oeffnen
// 2. bexio_contact_id schon gesetzt -> "In Bexio oeffnen" (gruen). Klick oeffnet
//    direkt den existierenden Bexio-Tab.
// 3. Bexio nicht verbunden -> Button verborgen.
//
// Lebt isoliert hier damit beide Seiten die exakt gleiche Logik nutzen.

import { useEffect, useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";

interface MatchCandidate {
  id: number;
  name: string;
  email: string | null;
  city: string | null;
  postcode: string | null;
  url: string;
}

interface Props {
  customerId: string;
  /** Aktuelle Bexio-ID am Customer — falls schon verknuepft. */
  bexioContactId: string | null;
  /** Gerufen nach erfolgreichem Anlegen oder Verknuepfen — Parent kann
   *  Customer neu laden um die ID frisch anzuzeigen. Optional. */
  onLinked?: (newId: string) => void;
}

export function BexioButton({ customerId, bexioContactId, onLinked }: Props) {
  const [bexioConnected, setBexioConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [linkedId, setLinkedId] = useState<string | null>(bexioContactId);

  useEffect(() => {
    setLinkedId(bexioContactId);
  }, [bexioContactId]);

  useEffect(() => {
    fetch("/api/bexio/status")
      .then((r) => r.json())
      .then((d) => setBexioConnected(!!d.connected))
      .catch(() => setBexioConnected(false));
  }, []);

  if (bexioConnected !== true) return null;

  // Zustand 2: schon verknuepft -> Tab oeffnen
  if (linkedId) {
    return (
      <a
        href={`https://office.bexio.com/index.php/kontakt/show/id/${linkedId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="kasten kasten-green shrink-0"
        title="Diesen Kunden in Bexio oeffnen"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        In Bexio öffnen
      </a>
    );
  }

  // Klick "In Bexio anlegen" -> Backend prueft ob's einen Treffer gibt.
  // - alreadyLinked: existierende Bexio-Kontakt-Seite oeffnen
  // - needsLinkConfirmation: Match-Modal zeigen ("Verknuepfen?")
  // - openCreateUrl: Bexio's Anlegen-Seite oeffnen (Daten dort manuell eingeben)
  async function attemptCreate() {
    setBusy(true);
    try {
      const res = await fetch("/api/bexio/contacts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const json = await res.json();

      if (json.needsLinkConfirmation && json.matches?.length) {
        setMatches(json.matches);
        return;
      }
      if (!json.success) {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
        return;
      }
      if (json.alreadyLinked) {
        setLinkedId(json.bexioContactId);
        onLinked?.(json.bexioContactId);
        window.open(json.bexioContactUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (json.openCreateUrl) {
        // Kein Match in Bexio -> direkt Anlegen-Seite oeffnen.
        toast.message("Trage die Kunden-Infos in Bexio ein");
        window.open(json.openCreateUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Netzwerkfehler";
      toast.error("Fehler: " + msg);
    } finally {
      setBusy(false);
    }
  }

  // Aus dem Match-Modal "Trotzdem neu anlegen" -> direkt Bexio-Anlegen-Seite.
  function openBexioNewContact() {
    setMatches(null);
    toast.message("Trage die Kunden-Infos in Bexio ein");
    window.open("https://office.bexio.com/index.php/kontakt/edit/id/0", "_blank", "noopener,noreferrer");
  }

  async function linkExisting(bexioId: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/bexio/contacts/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, bexioContactId: bexioId }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
        return;
      }
      const idStr = String(bexioId);
      setLinkedId(idStr);
      onLinked?.(idStr);
      setMatches(null);
      toast.success("Mit Bexio-Kontakt verknüpft");
      window.open(json.bexioContactUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Netzwerkfehler";
      toast.error("Fehler: " + msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={attemptCreate}
        disabled={busy}
        className="kasten kasten-green shrink-0"
        title="Diesen Kunden in Bexio als Kontakt anlegen"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {busy ? "Prüfe…" : "In Bexio anlegen"}
      </button>

      <Modal
        open={!!matches}
        onClose={() => setMatches(null)}
        title="Möglicher Treffer in Bexio"
        size="md"
        closable={!busy}
      >
        <p className="text-sm text-muted-foreground">
          Es gibt bereits {matches?.length === 1 ? "einen Kontakt" : `${matches?.length} Kontakte`} in Bexio die zu diesem Kunden passen könnten. Verknüpfe diesen Kunden mit dem richtigen Eintrag — oder lege trotzdem einen neuen an.
        </p>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {matches?.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 p-3 rounded-xl border bg-foreground/[0.02]">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium break-words">{m.name}</p>
                {m.email && (
                  <p className="text-xs text-muted-foreground break-all">{m.email}</p>
                )}
                {(m.postcode || m.city) && (
                  <p className="text-xs text-muted-foreground break-words">
                    {[m.postcode, m.city].filter(Boolean).join(" ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => linkExisting(m.id)}
                disabled={busy}
                className="kasten kasten-green shrink-0"
                title="Diesen Bexio-Kontakt mit Eventline-Kunden verknuepfen"
              >
                <Link2 className="h-3.5 w-3.5" />
                Verknüpfen
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => setMatches(null)} disabled={busy} className="kasten kasten-muted flex-1">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={openBexioNewContact}
            disabled={busy}
            className="kasten kasten-red flex-1"
            title="Trotzdem neuen Bexio-Kontakt manuell anlegen (riskiert Duplikat)"
          >
            Trotzdem neu anlegen
          </button>
        </div>
      </Modal>
    </>
  );
}
