"use client";

/**
 * Combobox / Searchable Select.
 * Wie ein <select>, aber mit Tipp-Filter:
 *   - Beim Tippen werden Vorschläge gefiltert (Wort-Start-Match)
 *   - Auswahl per Klick oder Enter
 *   - Dropdown wird via Portal in document.body gerendert (kein Card-Clipping)
 *
 * Verwendung:
 *   <SearchableSelect
 *     value={customerId}
 *     onChange={setCustomerId}
 *     items={customers.map(c => ({ id: c.id, label: c.name }))}
 *     placeholder="Kunde…"
 *   />
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

export type SelectItem = {
  id: string;
  label: string;
  sub?: string;
};

interface Props {
  value: string;
  onChange: (id: string) => void;
  items: SelectItem[];
  placeholder?: string;
  required?: boolean;
  id?: string;
}

function matchesWordStart(text: string, q: string): boolean {
  const lq = q.toLowerCase();
  const lower = text.toLowerCase();
  if (lower.startsWith(lq)) return true;
  return lower.split(/[\s,.\-/]+/).some((p) => p.startsWith(lq));
}

export function SearchableSelect({
  value,
  onChange,
  items,
  placeholder,
  required,
  id,
}: Props) {
  const selectedItem = items.find((i) => i.id === value) ?? null;
  const [search, setSearch] = useState(selectedItem?.label ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  // Wenn value von außen zurückgesetzt wird (z.B. durch Form-Reset oder Job-Type-Wechsel),
  // synchronisiere die Anzeige.
  useEffect(() => {
    setSearch(selectedItem?.label ?? "");
  }, [selectedItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setMounted(true), []);

  // Position des Dropdowns
  useEffect(() => {
    if (!open) return;
    function update() {
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Click outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const inWrapper = wrapperRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inWrapper && !inDropdown) {
        setOpen(false);
        // Wenn beim Verlassen kein Match, Anzeige auf letzten gültigen Wert zurücksetzen
        if (search !== (selectedItem?.label ?? "")) {
          setSearch(selectedItem?.label ?? "");
        }
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [search, selectedItem?.label]);

  const filtered = useMemo(() => {
    if (!open) return [];
    if (!search) return items.slice(0, 8);
    return items.filter((i) => matchesWordStart(i.label, search)).slice(0, 8);
  }, [items, search, open]);

  function pick(item: SelectItem) {
    onChange(item.id);
    setSearch(item.label);
    setOpen(false);
  }

  function clear() {
    onChange("");
    setSearch("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        pick(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch(selectedItem?.label ?? "");
    }
  }

  const dropdown =
    open && pos ? (
      <ul
        ref={dropdownRef}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
        }}
        className="z-[100] rounded-lg border bg-popover shadow-md max-h-72 overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            Keine Treffer.
          </li>
        ) : (
          filtered.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex items-start gap-2 px-3 py-2 text-sm cursor-pointer ${
                i === highlight ? "bg-muted" : ""
              } ${item.id === value ? "font-medium" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.label}</div>
                {item.sub && (
                  <div className="truncate text-xs text-muted-foreground">
                    {item.sub}
                  </div>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    ) : null;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        // Hidden required-validation: ein nicht-gewählter Wert führt zu submit-Fehler.
        // Wir lassen das input selber nicht required (sonst "fülle dieses Feld" — wir wollen
        // unsere eigene Fehlermeldung), die Form-validate-Funktion kümmert sich darum.
        aria-required={required}
        className="flex h-9 w-full rounded-lg border bg-background pl-3 pr-8 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Auswahl entfernen"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      )}
      {mounted && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
