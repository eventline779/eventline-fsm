"use client";

import type { Profile } from "@/types";
import { Logo } from "@/components/logo";

interface TopbarProps {
  profile: Profile;
  title?: string;
}

export function Topbar({ profile, title }: TopbarProps) {
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
      <div className="md:hidden">
        <Logo size="sm" />
      </div>
      {title && (
        <h2 className="hidden md:block text-lg font-semibold">{title}</h2>
      )}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden sm:block">
          {profile.full_name}
        </span>
      </div>
    </header>
  );
}
