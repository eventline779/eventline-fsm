"use client";

import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";

const PRIORITY_OPTIONS = [
  { id: "niedrig", label: "Niedrig" },
  { id: "normal", label: "Normal" },
  { id: "hoch", label: "Hoch" },
  { id: "dringend", label: "Dringend" },
];

interface Props {
  auftragForm: { title: string; priority: string; start_date: string; end_date: string; location_id: string };
  setAuftragForm: (f: Props["auftragForm"]) => void;
  locations: { id: string; name: string }[];
  onCreate: () => void | Promise<void>;
  onClose: () => void;
  creating: boolean;
}

export function AuftragModalBody({ auftragForm, setAuftragForm, locations, onCreate, onClose, creating }: Props) {
  return (
    <>
      <p className="text-sm text-gray-700 dark:text-gray-300">Der Auftrag wird mit allen Infos aus dem Lead erstellt. Leo wird per Email benachrichtigt.</p>
      <div>
        <label className="text-sm font-medium">Titel *</label>
        <Input value={auftragForm.title} onChange={(e) => setAuftragForm({ ...auftragForm, title: e.target.value })} className="mt-1.5 bg-gray-50" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Startdatum</label>
          <Input type="date" value={auftragForm.start_date} onChange={(e) => setAuftragForm({ ...auftragForm, start_date: e.target.value })} className="mt-1.5 bg-gray-50" />
        </div>
        <div>
          <label className="text-sm font-medium">Enddatum</label>
          <Input type="date" value={auftragForm.end_date} onChange={(e) => setAuftragForm({ ...auftragForm, end_date: e.target.value })} className="mt-1.5 bg-gray-50" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Priorität</label>
          <div className="mt-1.5">
            <SearchableSelect
              value={auftragForm.priority}
              onChange={(v) => setAuftragForm({ ...auftragForm, priority: v })}
              items={PRIORITY_OPTIONS}
              clearable={false}
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Location</label>
          <div className="mt-1.5">
            <SearchableSelect
              value={auftragForm.location_id}
              onChange={(v) => setAuftragForm({ ...auftragForm, location_id: v })}
              items={locations.map((l) => ({ id: l.id, label: l.name }))}
              placeholder="— Keine —"
            />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Nach Erstellung wirst du zur Auftrags-Seite weitergeleitet, wo du den Schichtplan machen kannst.</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="kasten kasten-muted flex-1">Abbrechen</button>
        <button onClick={onCreate} disabled={!auftragForm.title || creating} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
          <Check className="h-4 w-4" />{creating ? "Erstellen..." : "Auftrag erstellen"}
        </button>
      </div>
    </>
  );
}
