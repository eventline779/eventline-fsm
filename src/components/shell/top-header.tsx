"use client";

/**
 * Top-Header: sticky horizontal-Bar oben im Content-Bereich.
 * Nimmt die ganze Header-Breite als Suchfeld — kein Kasten-in-Kasten,
 * dadurch integriert der Trigger sich in die Header-Zeile statt als
 * schwebendes Element wirken (Leo 2026-09-05: "wirkt fehl am Platz").
 * Nur Desktop (md+). Auf Mobile uebernimmt MobileNav + Sheet-Menu.
 */

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CMDK_OPEN_EVENT } from "@/components/shell/command-palette";

export function TopHeader() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  const openPalette = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CMDK_OPEN_EVENT));
    }
  };

  return (
    <header className="hidden md:flex sticky top-0 z-20 h-16 items-center justify-center px-6 border-b border-border bg-background/80 backdrop-blur-md">
      <button
        type="button"
        onClick={openPalette}
        className="group flex items-center gap-3 pl-4 pr-2.5 h-11 rounded-full border border-border/80 bg-foreground/[0.02] dark:bg-white/[0.04] dark:border-white/10 text-muted-foreground hover:text-foreground hover:border-border hover:bg-foreground/[0.05] dark:hover:bg-white/[0.07] dark:hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500/40 transition-all w-full max-w-xl text-sm"
        aria-label="Suche oeffnen"
      >
        <Search className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        <span className="flex-1 text-left truncate">Suchen — Aufträge, Kunden, Leads, Räume, Tickets…</span>
        <kbd className="inline-flex items-center px-2 py-1 text-[11px] font-medium rounded-md border border-border/60 dark:border-white/10 bg-background/60 dark:bg-white/[0.05] text-muted-foreground/80 shrink-0 tracking-wide">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </header>
  );
}
