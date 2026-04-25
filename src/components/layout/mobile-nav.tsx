"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Clock,
  Menu,
} from "lucide-react";

const mobileItems = [
  { href: "/heute", label: "Heute", icon: LayoutDashboard },
  { href: "/auftraege", label: "Events", icon: ClipboardList },
  { href: "/kalender", label: "Kalender", icon: Calendar },
  { href: "/zeiterfassung", label: "Zeit", icon: Clock },
];

interface MobileNavProps {
  onMenuOpen: () => void;
}

export function MobileNav({ onMenuOpen }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-lg border-t border-white/10 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-1 pt-2 pb-1">
        {mobileItems.map((item) => {
          const isActive = item.href === "/heute" ? pathname === "/heute" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-[10px] font-medium transition-all min-w-[60px]",
                isActive
                  ? "text-red-500"
                  : "text-gray-500 active:text-white"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "scale-110")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-gray-500 text-[10px] font-medium active:text-white min-w-[60px]"
        >
          <Menu className="h-5 w-5" />
          <span>Mehr</span>
        </button>
      </div>
    </nav>
  );
}
