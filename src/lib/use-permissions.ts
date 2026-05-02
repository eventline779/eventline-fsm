"use client";

// React-Hook der die Permissions des eingeloggten Users laedt und einen
// can(perm)-Helper liefert. Cached pro Tab — bei Rollen-Aenderungen muss
// der User sich aus- und wieder einloggen damit das frisch zieht.
//
// Nutzung:
//   const { can } = usePermissions();
//   {can("kunden:edit") && <button>Bearbeiten</button>}

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission } from "@/lib/permissions";

interface PermissionState {
  permissions: string[];
  role: string;
  ready: boolean;
}

export function usePermissions() {
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

  function can(perm: string): boolean {
    return hasPermission(state.permissions, state.role, perm);
  }

  return { can, ready: state.ready, role: state.role, permissions: state.permissions };
}
