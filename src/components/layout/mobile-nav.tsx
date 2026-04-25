"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { NAV_GROUPS, ADMIN_NAV_GROUP, type NavItem } from "@/lib/constants";
import { NAV_ICON_MAP } from "@/lib/nav-icons";

interface MobileNavProps {
  onMenuOpen: () => void;
}

// Pulls items flagged `mobile: true` from NAV_GROUPS — single source of truth.
// Includes admin items if present so a future admin-only mobile shortcut works.
function getMobileItems(): NavItem[] {
  const all = [...NAV_GROUPS, ADMIN_NAV_GROUP].flatMap((g) => g.items);
  return all.filter((item) => item.mobile).slice(0, 4);
}

export function MobileNav({ onMenuOpen }: MobileNavProps) {
  const pathname = usePathname();
  const items = getMobileItems();

  function isActive(href: string) {
    if (href === "/heute") return pathname === "/heute";
    if (href === "/kalender") return pathname === "/kalender";
    return pathname.startsWith(href);
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-lg border-t border-white/10 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-1 pt-2 pb-1">
        {items.map((item) => {
          const Icon = NAV_ICON_MAP[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all min-w-[60px]",
                active ? "text-red-500" : "text-gray-500 active:text-white"
              )}
            >
              {Icon && <Icon className={cn("h-5 w-5", active && "scale-110")} />}
              <span className="truncate max-w-[64px]">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-gray-500 text-[10px] font-medium active:text-white min-w-[60px]"
        >
          <Menu className="h-5 w-5" />
          <span>Mehr</span>
        </button>
      </div>
    </nav>
  );
}
