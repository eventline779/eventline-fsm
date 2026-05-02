"use client";

/**
 * Dashboard ("Heute") — minimal nach dem grossen Cleanup-Refactor.
 * Inhalt komplett entfernt; nur noch der zeitabhaengige Greeting bleibt.
 * Ein zukuenftiger Re-Build kann hier neue Widgets hinzufuegen.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function greetingForHour(h: number): string {
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

export default function HeutePage() {
  const supabase = createClient();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profile?.full_name) setUserName(profile.full_name.split(" ")[0]);
    })();
  }, [supabase]);

  const greeting = greetingForHour(new Date().getHours());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}{userName ? ` ${userName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("de-CH", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
