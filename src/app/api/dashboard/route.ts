// GET /api/dashboard — rollen-basiertes Cockpit-Bundle fuer die Startseite.
//
// Rueckgabe je nach profiles.role:
//
//   role = "techniker" -> {
//     role, first_name,
//     ma: {
//       monat_stunden, ist_lohn_chf, wage_exempt, hourly_wage_chf,
//       prognose_stunden, prognose_lohn_chf,
//       naechster_einsatz: { id, title, start_time, end_time?, job_number, job_title, customer_name } | null,
//     }
//   }
//   role = "admin" -> {
//     role, first_name,
//     kpi: { offene_auftraege, geplante_termine_woche, nicht_abgerechnet },
//     zu_erledigen: { ferien_pending, ueberfaellige_auftraege, neue_belege },
//     team_status: { eingestempelt, in_ferien_heute },
//   }
//   role = "partner" -> { role, first_name }
//
// Lohn-Berechnung MA: bucketizeMinutes(clock_in, clock_out) fuer DST-safe
// Ist-Stunden. Prognose = Ist-Stunden + geplante Termine (start_time in
// aktuellem Monat, in der Zukunft). Netto-Faktor = 1 - (Summe AN-Pcts / 100),
// analog wage-documents/generate — nur ohne Nacht/Sonntags-Zuschlaege
// (Dashboard-Naeherung, nicht die richtige Lohnabrechnung).
//
// Sensible Zahlen: wir lesen employee_compensation via Admin-Client, aber
// STRIKT nur die eigene Zeile (profile_id == auth.user.id) — kein Leak
// anderer Loehne. Fuer Admin-Cockpit ebenfalls Admin-Client (Counts brauchen
// meist RLS-Bypass, Admin passt aber ohnehin via has_permission).

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bucketizeMinutes,
  todayLocalIso,
  localDateIso,
  type MinuteBucket,
} from "@/lib/swiss-time";
import {
  loadLohnDefaults,
  effectivePcts,
  sumEmployeePct,
  type PctComp,
} from "@/lib/employer-costs";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Erster Tag des aktuellen Monats im Europe/Zurich-Kalender als YYYY-MM-DD. */
function currentMonthStartIso(): string {
  const today = todayLocalIso(); // YYYY-MM-DD
  return `${today.slice(0, 7)}-01`;
}

/** Startzeitstempel (UTC-ms) sicher vor Monatsanfang lokal. Nimmt
 *  monthStart YYYY-MM-DD und subtrahiert 2 Tage — damit sind alle
 *  time_entries des Monats sicher enthalten, egal was UTC-Offset macht. */
function safeUtcMsFromLocalDate(iso: string, subtractDays = 2): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - subtractDays * 24 * 3600 * 1000;
}

/** Montag 00:00 der aktuellen Woche (Europe/Zurich) als YYYY-MM-DD.
 *  Rechnet ausschliesslich mit Lokal-Datums-Strings (kein Date-Rundlauf). */
function currentWeekStartIso(): string {
  const today = todayLocalIso();
  const [y, m, d] = today.split("-").map(Number);
  // Wochentag via Date.UTC + getUTCDay ist stabil, weil wir das Datum als
  // "reines Tages-Datum" behandeln (kein TZ-Drift bei mittags Timestamps).
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // So=0..Sa=6
  const monOffset = (dow + 6) % 7; // Mo=0, So=6
  const monday = new Date(Date.UTC(y, m - 1, d - monOffset));
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Techniker: eigenes Cockpit
// ---------------------------------------------------------------------------

interface MaPayload {
  monat_stunden: number;
  ist_lohn_chf: number;
  wage_exempt: boolean;
  hourly_wage_chf: number | null;
  prognose_stunden: number;
  prognose_lohn_chf: number;
  naechster_einsatz: {
    id: string;
    title: string;
    start_time: string;
    end_time: string | null;
    job_number: number | null;
    job_title: string | null;
    customer_name: string | null;
  } | null;
}

async function loadMaData(userId: string): Promise<MaPayload> {
  const admin = createAdminClient();
  const monthStartIso = currentMonthStartIso(); // YYYY-MM-01
  const monthPrefix = monthStartIso.slice(0, 7); // YYYY-MM
  const nowMs = Date.now();
  const fetchFromMs = safeUtcMsFromLocalDate(monthStartIso, 2);
  // Sichere obere Grenze fuer Appointments-Fetch: erster Tag naechster Monat + 2 Tage.
  const [my, mm] = monthStartIso.split("-").map(Number);
  const monthEndSafeMs = Date.UTC(my, mm, 3); // mm=1..12 -> naechster-Monat-Index; +3 Tage Puffer
  const monthEndSafeIso = new Date(monthEndSafeMs).toISOString();

  // Compensation-Row des Users. Admin-Client umgeht RLS — wir filtern strikt
  // auf profile_id == userId, kein Fremd-Lohn-Leak moeglich.
  const [compRes, entriesRes, defaults, apptsMonthRes, nextApptRes] = await Promise.all([
    admin
      .from("employee_compensation")
      .select("hourly_wage_chf, uses_standard_lohn, wage_exempt, ahv_iv_eo_pct, alv_pct, nbu_pct, bvg_pct, ktg_pct, quellensteuer_pct, employer_ahv_pct, employer_alv_pct, employer_fak_pct, employer_bu_pct, employer_bvg_pct, employer_verwaltung_pct, effective_from, effective_to")
      .eq("profile_id", userId)
      .lte("effective_from", todayLocalIso())
      .or(`effective_to.is.null,effective_to.gte.${todayLocalIso()}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("time_entries")
      .select("clock_in, clock_out")
      .eq("user_id", userId)
      .not("clock_out", "is", null)
      .gte("clock_in", new Date(fetchFromMs).toISOString()),
    loadLohnDefaults(admin, monthStartIso),
    // Alle eigenen Termine im aktuellen Monat (fuer Prognose)
    admin
      .from("job_appointments")
      .select("start_time, end_time")
      .eq("assigned_to", userId)
      .gte("start_time", new Date(fetchFromMs).toISOString())
      .lt("start_time", monthEndSafeIso),
    // Naechster eigener Termin (>= jetzt)
    admin
      .from("job_appointments")
      .select("id, title, start_time, end_time, job:jobs(job_number, title, customer:customers(name))")
      .eq("assigned_to", userId)
      .gte("start_time", new Date(nowMs).toISOString())
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  // ------- Ist-Stunden diesen Monat (DST-safe via bucketize) -------
  type Entry = { clock_in: string; clock_out: string | null };
  const buckets = new Map<string, MinuteBucket>();
  for (const e of (entriesRes.data ?? []) as Entry[]) {
    if (!e.clock_out) continue;
    bucketizeMinutes(new Date(e.clock_in).getTime(), new Date(e.clock_out).getTime(), buckets);
  }
  let monatMinuten = 0;
  for (const b of buckets.values()) {
    if (b.date.startsWith(monthPrefix)) monatMinuten += b.total_minutes;
  }
  const monatStunden = Math.round((monatMinuten / 60) * 100) / 100;

  // ------- Compensation-Werte -------
  const comp = compRes.data as PctComp & {
    hourly_wage_chf?: number | string | null;
    wage_exempt?: boolean | null;
  } | null;
  const wageExempt = comp?.wage_exempt === true;
  const hourlyWage = comp?.hourly_wage_chf == null ? null : Number(comp.hourly_wage_chf);
  const pcts = effectivePcts(comp, defaults);
  const employeeDeductionPct = sumEmployeePct(pcts);
  const nettoFactor = 1 - employeeDeductionPct / 100;

  const istLohn = wageExempt || hourlyWage == null
    ? 0
    : Math.round(monatStunden * hourlyWage * nettoFactor * 100) / 100;

  // ------- Prognose: Ist + zukuenftige geplante Stunden diesen Monat -------
  type Appt = { start_time: string; end_time: string | null };
  let plannedMinuten = 0;
  const nowIso = new Date(nowMs).toISOString();
  for (const a of (apptsMonthRes.data ?? []) as Appt[]) {
    if (!a.end_time) continue;
    // Nur Termine die in DER LOKALEN Monatsansicht liegen und noch nicht
    // vorbei sind. Vergangene Termine sind entweder schon per Stempel
    // erfasst oder gar nicht stattgefunden — beides Wille nicht doppelzaehlen.
    if (a.start_time < nowIso) continue;
    const startDate = localDateIso(new Date(a.start_time));
    if (!startDate.startsWith(monthPrefix)) continue;
    const durMs = new Date(a.end_time).getTime() - new Date(a.start_time).getTime();
    if (durMs > 0) plannedMinuten += durMs / 60000;
  }
  const prognoseStunden = Math.round((monatStunden + plannedMinuten / 60) * 100) / 100;
  const prognoseLohn = wageExempt || hourlyWage == null
    ? 0
    : Math.round(prognoseStunden * hourlyWage * nettoFactor * 100) / 100;

  // ------- Naechster Einsatz -------
  const nextRow = nextApptRes.data as {
    id: string;
    title: string;
    start_time: string;
    end_time: string | null;
    job: {
      job_number: number | null;
      title: string;
      customer: { name: string } | null;
    } | null;
  } | null;
  const naechster = nextRow
    ? {
        id: nextRow.id,
        title: nextRow.title,
        start_time: nextRow.start_time,
        end_time: nextRow.end_time,
        job_number: nextRow.job?.job_number ?? null,
        job_title: nextRow.job?.title ?? null,
        customer_name: nextRow.job?.customer?.name ?? null,
      }
    : null;

  return {
    monat_stunden: monatStunden,
    ist_lohn_chf: istLohn,
    wage_exempt: wageExempt,
    hourly_wage_chf: hourlyWage,
    prognose_stunden: prognoseStunden,
    prognose_lohn_chf: prognoseLohn,
    naechster_einsatz: naechster,
  };
}

// ---------------------------------------------------------------------------
// Admin: Firma-Cockpit
// ---------------------------------------------------------------------------

interface AdminPayload {
  kpi: {
    offene_auftraege: number;
    geplante_termine_woche: number;
    nicht_abgerechnet: number;
  };
  zu_erledigen: {
    ferien_pending: number;
    ueberfaellige_auftraege: number;
    neue_belege: number;
  };
  team_status: {
    eingestempelt: number;
    in_ferien_heute: number;
  };
}

async function loadAdminData(): Promise<AdminPayload> {
  const admin = createAdminClient();
  const today = todayLocalIso();
  const weekStart = currentWeekStartIso();
  const [y, m, d] = weekStart.split("-").map(Number);
  const weekEndDate = new Date(Date.UTC(y, m - 1, d + 7));
  const weekEndIso = weekEndDate.toISOString();
  const weekStartIso = new Date(Date.UTC(y, m - 1, d)).toISOString();

  const [
    offeneAuftraege,
    geplanteTermineWoche,
    nichtAbgerechnet,
    ferienPending,
    ueberfaelligeAuftraege,
    neueBelege,
    eingestempelt,
    ferienHeute,
  ] = await Promise.all([
    admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "offen")
      .neq("is_deleted", true),
    admin
      .from("job_appointments")
      .select("id", { count: "exact", head: true })
      .gte("start_time", weekStartIso)
      .lt("start_time", weekEndIso),
    admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "abgeschlossen")
      .is("invoiced_at", null)
      .is("invoice_skipped_at", null)
      .neq("is_deleted", true),
    admin
      .from("time_off")
      .select("id", { count: "exact", head: true })
      .eq("status", "beantragt"),
    admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "offen")
      .neq("is_deleted", true)
      .lt("end_date", today),
    admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("type", "beleg")
      .is("filed_at", null)
      .neq("status", "abgelehnt"),
    admin
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .is("clock_out", null),
    admin
      .from("time_off")
      .select("id", { count: "exact", head: true })
      .eq("status", "genehmigt")
      .lte("start_date", today)
      .gte("end_date", today),
  ]);

  return {
    kpi: {
      offene_auftraege: offeneAuftraege.count ?? 0,
      geplante_termine_woche: geplanteTermineWoche.count ?? 0,
      nicht_abgerechnet: nichtAbgerechnet.count ?? 0,
    },
    zu_erledigen: {
      ferien_pending: ferienPending.count ?? 0,
      ueberfaellige_auftraege: ueberfaelligeAuftraege.count ?? 0,
      neue_belege: neueBelege.count ?? 0,
    },
    team_status: {
      eingestempelt: eingestempelt.count ?? 0,
      in_ferien_heute: ferienHeute.count ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", auth.user.id)
    .single();
  if (profErr || !profile) {
    return NextResponse.json({ success: false, error: "Profil nicht gefunden" }, { status: 500 });
  }

  const firstName = (profile.full_name ?? "").split(" ")[0] ?? "";
  const role = profile.role ?? "";

  try {
    if (role === "admin") {
      const adminData = await loadAdminData();
      return NextResponse.json(
        { success: true, role, first_name: firstName, admin: adminData },
        { headers: { "Cache-Control": "private, max-age=60" } },
      );
    }

    if (role === "techniker") {
      const ma = await loadMaData(auth.user.id);
      return NextResponse.json(
        { success: true, role, first_name: firstName, ma },
        { headers: { "Cache-Control": "private, max-age=60" } },
      );
    }

    // partner (und alle anderen Rollen) — nur Begruessung
    return NextResponse.json(
      { success: true, role, first_name: firstName },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
