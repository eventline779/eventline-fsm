"use client";

// Stempel-Hook: liefert aktiven Eintrag + clockIn/clockOut/cancel-Funktionen.
//
// "Aktiv" = Eintrag mit clock_out IS NULL — pro User nur einer (DB-Constraint).
// Realtime-Subscription (postgres_changes) sorgt dafuer dass der Hook auf
// Updates von anderen Tabs / Devices reagiert (z.B. ausgestempelt vom Handy).
//
// Der Hook ist zentral genug um in Layout + Widget + Page genutzt zu werden,
// jeder Aufrufer kriegt seinen eigenen Subscription — bei vielen Mounts
// koennte man hier in einen Context optimieren, aktuell aber bei <10
// gleichzeitigen Aufrufen unkritisch.

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry } from "@/types";

interface ClockInOpts {
  jobId?: string | null;
  description?: string | null;
}

export function useStempel() {
  const supabase = createClient();
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setActive(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", user.id)
      .is("clock_out", null)
      .maybeSingle();
    setActive((data as TimeEntry | null) ?? null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Channel-Name pro Hook-Instanz eindeutig — verhindert
  // "cannot add postgres_changes callbacks after subscribe()" wenn
  // mehrere useStempel()-Aufrufe parallel laufen (Widget + JobButton +
  // /stempelzeiten-Page). Mit dem Singleton-Client wuerden sie sonst
  // denselben Channel teilen und sich gegenseitig bei `.on()` blocken.
  const channelIdRef = useRef<string>(`stempel-self-${Math.random().toString(36).slice(2)}`);

  // Realtime-Sub: wenn der eigene User-Row sich aendert (egal woher),
  // refreshen. Damit ist der Hook konsistent ueber Tabs hinweg.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(channelIdRef.current)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "time_entries",
            filter: `user_id=eq.${user.id}`,
          },
          () => { refresh(); },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  async function clockIn(opts: ClockInOpts): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt" };
    const payload = {
      user_id: user.id,
      job_id: opts.jobId ?? null,
      description: opts.description?.trim() || null,
      // Explizit setzen — Default `now()` ist zwar in DB, aber im Code
      // klar machen damit's nicht von einer migrations-Aenderung abhaengt.
      clock_in: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("time_entries")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      // Unique-Index "time_entries_one_active_per_user" schlaegt zu wenn
      // schon ein offener Eintrag existiert. Heuristik fuer den Code.
      if (error.code === "23505") {
        return { success: false, error: "Du bist schon eingestempelt" };
      }
      return { success: false, error: error.message };
    }
    setActive(data as TimeEntry);
    return { success: true };
  }

  async function clockOut(): Promise<{ success: boolean; error?: string }> {
    if (!active) return { success: false, error: "Nicht eingestempelt" };
    const { error } = await supabase
      .from("time_entries")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", active.id);
    if (error) return { success: false, error: error.message };
    setActive(null);
    return { success: true };
  }

  // Eintrag komplett verwerfen — nur sinnvoll wenn jemand versehentlich
  // gestempelt hat. Eintraege im DB als gepflegtes Audit-Log halten ist
  // wichtig, deshalb hartes Loeschen statt clock_out=clock_in-Pseudo.
  async function discardActive(): Promise<{ success: boolean; error?: string }> {
    if (!active) return { success: false, error: "Nicht eingestempelt" };
    const { error } = await supabase.from("time_entries").delete().eq("id", active.id);
    if (error) return { success: false, error: error.message };
    setActive(null);
    return { success: true };
  }

  return { active, loading, clockIn, clockOut, discardActive, refresh };
}

// Hilfsfunktion fuer Live-Timer-Anzeige.
export function formatStempelDuration(clockIn: string, now: number = Date.now()): string {
  const start = new Date(clockIn).getTime();
  const totalSec = Math.max(0, Math.floor((now - start) / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}
