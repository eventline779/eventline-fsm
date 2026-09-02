"use client";

/**
 * Top-Header: sticky horizontal-Bar oben im Content-Bereich.
 * Enthaelt Sidebar-Toggle links und die Command-Palette-Suche breit
 * in der Mitte. Nur Desktop (md+). Auf Mobile uebernimmt die vorhandene
 * MobileNav (Bottom-Bar) + Sheet-Menu die Navigation.
 *
 * Der Suchfeld-Trigger hier ist visuell prominenter als der frueher in
 * der Sidebar — laenger, mit Placeholder-Text, so wie in Linear/Notion.
 */

import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CMDK_OPEN_EVENT } from "@/components/shell/command-palette";

interface Props {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function TopHeader({ sidebarCollapsed, onToggleSidebar }: Props) {
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
    <header className="hidden md:flex sticky top-0 z-20 h-12 items-center gap-3 px-4 border-b border-border bg-background/85 backdrop-blur">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
        aria-label={sidebarCollapsed ? "Sidebar einblenden" : "Sidebar ausblenden"}
        data-tooltip={sidebarCollapsed ? "Sidebar einblenden" : "Sidebar ausblenden"}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={openPalette}
        className="flex items-center gap-2 px-3 h-8 rounded-md border border-border bg-foreground/[0.03] dark:bg-white/[0.05] dark:border-white/15 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] dark:hover:bg-white/[0.10] transition-colors w-full max-w-md text-xs"
        aria-label="Suche oeffnen"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Suchen — Aufträge, Kunden, Leads, Räume, Tickets…</span>
        <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border border-border dark:border-white/15 bg-background dark:bg-white/[0.04] text-muted-foreground shrink-0">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </header>
  );
}
