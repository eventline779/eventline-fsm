"use client";

// Permissions-Context fuer die ganze (app)/-Seitenleiste.
//
// Vorher: usePermissions() lud bei jedem Hook-Call zwei DB-Queries (profile +
// role) → bei 16 Konsumenten und vielen Sub-Komponenten 30+ redundante
// Roundtrips pro Page-Mount. Jetzt: ein Provider im (app)/layout, der die
// Permissions EINMAL laedt und allen Sub-Komponenten via Context bereitstellt.
//
// Nutzung im Layout:
//   <PermissionsProvider>
//     <App />
//   </PermissionsProvider>
//
// Nutzung im Code (kein Setup-Wechsel — selber Hook-Name):
//   const { can } = usePermissions();
//   {can("kunden:edit") && <button>Bearbeiten</button>}
//
// Nutzung ausserhalb des Providers (z.B. /login): Hook fuehrt einen einmaligen
// Self-Load aus, identisch zum frueheren Verhalten — Backwards-Compat.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission } from "@/lib/permissions";

interface PermissionState {
  permissions: string[];
  role: string;
  ready: boolean;
}

const PermissionsContext = createContext<PermissionState | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PermissionState>({ permissions: [], role: "", ready: false });
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({ permissions: [], role: "", ready: true });
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const role = profile?.role ?? "";
      const { data: roleRow } = await supabase.from("roles").select("permissions").eq("slug", role).single();
      const perms = Array.isArray(roleRow?.permissions) ? (roleRow.permissions as string[]) : [];
      setState({ permissions: perms, role, ready: true });
    })();
  }, [supabase]);

  return <PermissionsContext.Provider value={state}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  // Fallback: ohne Provider (z.B. /login) eigenstaendig laden.
  // So bleibt der Hook overall robust.
  const [fallback, setFallback] = useState<PermissionState>({ permissions: [], role: "", ready: false });
  const supabase = createClient();

  useEffect(() => {
    if (ctx) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFallback({ permissions: [], role: "", ready: true });
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const role = profile?.role ?? "";
      const { data: roleRow } = await supabase.from("roles").select("permissions").eq("slug", role).single();
      const perms = Array.isArray(roleRow?.permissions) ? (roleRow.permissions as string[]) : [];
      setFallback({ permissions: perms, role, ready: true });
    })();
  }, [ctx, supabase]);

  const state = ctx ?? fallback;

  function can(perm: string): boolean {
    return hasPermission(state.permissions, state.role, perm);
  }

  return { can, ready: state.ready, role: state.role, permissions: state.permissions };
}
