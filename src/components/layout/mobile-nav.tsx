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
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/auftraege", label: "Aufträge", icon: ClipboardList },
  { href: "/kalender", label: "Kalender", icon: Calendar },
  { href: "/zeiterfassung", label: "Zeit", icon: Clock },
];

interface MobileNavProps {
  onMenuOpen: () => void;
}

export function MobileNav({ onMenuOpen }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-50">
      <div className="flex items-center justify-around px-2 py-2">
        {mobileItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 rounded-md text-xs transition-colors",
                isActive
                  ? "text-red-500"
                  : "text-gray-400"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center gap-1 px-3 py-1.5 text-gray-400 text-xs"
        >
          <Menu className="h-5 w-5" />
          Mehr
        </button>
      </div>
    </nav>
  );
}
