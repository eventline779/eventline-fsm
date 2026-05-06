"use client";

// Permissions + Profile-Context fuer die ganze (app)/-Seitenleiste.
//
// EIN Loader im Provider, alle Sub-Komponenten konsumieren via Hook.
// Vorher gabs zwei Loader-Pfade (Layout selbst + dieser Provider) und
// jeder Page-Mount hat profiles + roles doppelt geladen.

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission } from "@/lib/permissions";
import type { Profile } from "@/types";

interface AppContextState {
  profile: Profile | null;
  permissions: string[];
  role: string;
  ready: boolean;
  loadError: string | null;
}

const PermissionsContext = createContext<AppContextState | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppContextState>({
    profile: null,
    permissions: [],
    role: "",
    ready: false,
    loadError: null,
  });
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setState({ profile: null, permissions: [], role: "", ready: true, loadError: null });
          return;
        }

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (cancelled) return;
        if (profErr) {
          setState({ profile: null, permissions: [], role: "", ready: true, loadError: `Profil-Laden fehlgeschlagen: ${profErr.message}` });
          return;
        }
        if (!profile) {
          setState({ profile: null, permissions: [], role: "", ready: true, loadError: "Profil nicht gefunden für diesen User." });
          return;
        }

        const role = (profile as Profile).role ?? "";
        const { data: roleRow } = await supabase
          .from("roles")
          .select("permissions")
          .eq("slug", role)
          .single();
        if (cancelled) return;

        const perms = Array.isArray(roleRow?.permissions) ? (roleRow.permissions as string[]) : [];
        setState({
          profile: profile as Profile,
          permissions: perms,
          role,
          ready: true,
          loadError: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          profile: null, permissions: [], role: "", ready: true,
          loadError: err instanceof Error ? err.message : "Unbekannter Fehler beim Laden",
        });
      }
    }
    load();

    // Re-Load bei Auth-Wechsel (Login/Logout in anderem Tab) — verhindert
    // dass die App mit alter Profile-Sicht weiterlaeuft nachdem der User
    // sich anders eingeloggt hat.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        load();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Memo-isiertes Value damit Konsumenten nicht bei jedem Provider-Render
  // re-rendern obwohl sich nichts geaendert hat.
  const value = useMemo(() => state, [state]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/**
 * Permissions-Hook. Liefert can()-Helper + Profile + Meta.
 * Funktioniert nur innerhalb eines PermissionsProvider.
 */
export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  const state = ctx ?? {
    profile: null,
    permissions: [] as string[],
    role: "",
    ready: false,
    loadError: null,
  };

  function can(perm: string): boolean {
    return hasPermission(state.permissions, state.role, perm);
  }

  return {
    can,
    ready: state.ready,
    role: state.role,
    permissions: state.permissions,
    profile: state.profile,
    loadError: state.loadError,
  };
}
