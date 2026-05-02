import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-Client als Singleton — mehrere Hooks (useStempel, usePermissions,
// jede Page) wuerden sonst parallel Auth-Token-Locks anfordern, was zu
// "AbortError: Lock broken by another request" fuehrt. EIN Client pro Tab
// teilt sich den Auth-State sauber.
//
// Wir parken die Instanz auf dem window-Objekt damit Hot-Reload im Dev-
// Modus nicht jedes Mal einen neuen Client erzeugt (das wuerde dieselbe
// Lock-Kollision wieder ausloesen, wenn HMR Module-Variablen verliert).
declare global {
  interface Window {
    __eventlineSupabaseClient?: SupabaseClient;
  }
}

export function createClient(): SupabaseClient {
  if (typeof window === "undefined") {
    // SSR: jeder Aufruf bekommt einen eigenen Client (ueblicher Server-Pfad).
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  if (window.__eventlineSupabaseClient) return window.__eventlineSupabaseClient;
  window.__eventlineSupabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return window.__eventlineSupabaseClient;
}
