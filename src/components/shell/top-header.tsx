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
    <header className="hidden md:block sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <button
        type="button"
        onClick={openPalette}
        className="w-full h-12 flex items-center gap-2.5 px-6 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03] dark:hover:bg-white/[0.04] transition-colors text-left text-[13px]"
        aria-label="Suche oeffnen"
      >
        <Search className="h-4 w-4 shrink-0 opacity-70" />
        <span className="flex-1">Suchen…</span>
        <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded border border-border/70 dark:border-white/15 bg-foreground/[0.04] dark:bg-white/[0.06] text-muted-foreground/80 shrink-0">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </header>
  );
}
