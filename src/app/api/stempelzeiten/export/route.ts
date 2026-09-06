// GET /api/stempelzeiten/export?from=YYYY-MM-DD&to=YYYY-MM-DD&user=<uuid|all>&auftrag=<n>&mode=archive
//
// Excel-Export der Stempelzeiten-Ansicht (Timesheets). Spiegelt die Filter-
// Semantik der /stempelzeiten-View 1:1:
//   - user=all         → alle via RLS sichtbaren Rows (Admin=alle, Teamleiter
//                        =Team+self via sees_user(), Normal-User=nur eigene).
//   - user=<uuid>      → nur dieser User.
//   - user leer / self → nur eigene (Default — auch wenn der User Admin waere,
//                        haelt "Eigene Sicht" bewusst nur eigene Eintraege).
//   - auftrag=<n>      → alle Rows auf diesem Auftrag (job_number). Ueberschreibt
//                        den user-Filter (Auftrags-Ansicht zeigt bewusst alle MA).
//   - from / to        → optional, Default: letzte 30 Tage. Format YYYY-MM-DD.
//   - mode=archive     → Zeitfenster deaktivieren, ALLE via RLS sichtbaren
//                        Eintraege exportieren (spiegelt Archiv-Modus der View).
//                        from/to werden ignoriert; Dateiname `stempelzeiten_archiv_<to>.xlsx`.
//
// RLS entscheidet welche Zeilen der User tatsaechlich sehen darf
// (time_entries_select_* Policies + sees_user() fuer Teamleiter). Der
// Endpoint filtert on-top nur die "user"-Auswahl analog zur UI.
//
// Spalten: Datum · Von · Bis · Dauer (h) · Mitarbeiter · Auftrag · Projekt ·
// Beschreibung · Notiz. Alle Zeitwerte in Europe/Zurich.
//
// Permission: stempelzeiten:view (haben alle Rollen — der Endpoint respektiert
// zusaetzlich RLS, wer keine Zeilen sehen darf bekommt ein leeres Sheet mit
// Header-Zeile).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/api-auth";
import { formatProjectNumber } from "@/lib/projekte-format";
import { ZRH_TZ } from "@/lib/swiss-time";
import ExcelJS from "exceljs";

interface ExportRow {
  id: string;
  user_id: string;
  job_id: string | null;
  project_id: string | null;
  clock_in: string;
  clock_out: string | null;
  description: string | null;
  notes: string | null;
  job: { job_number: number; title: string } | null;
  project: { project_number: number | null; title: string } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_USERS_URL_VALUE = "all";

/** UTC-basiertes YYYY-MM-DD — nur fuer Default-Range, nicht fuer Anzeige. */
function utcIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    timeZone: ZRH_TZ,
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-CH", {
    timeZone: ZRH_TZ,
    hour: "2-digit", minute: "2-digit",
  });
}

/** Nutzer-Eingabe "INT-26268", "int 26268", "26268" → geparste int oder null.
 *  int4-Schutz (>2^31-1) fuer versehentliche Telefonnummer-Eingaben. */
function parseJobNumber(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 2147483647) return null; // int4-Overflow-Guard
  return n;
}

export async function GET(req: Request) {
  const auth = await requirePermission("stempelzeiten:view");
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  // Beide Aliases akzeptieren: `user` (wie in der View-URL) und `user_id`.
  const userParam = url.searchParams.get("user") ?? url.searchParams.get("user_id");
  const auftragParam = url.searchParams.get("auftrag");
  // Archiv-Modus: kein Zeitfenster, alle via RLS sichtbaren Eintraege.
  const isArchive = url.searchParams.get("mode") === "archive";

  // Default: letzte 30 Tage (spiegelt DEFAULT_RANGE_DAYS in stempelzeiten-view).
  const nowMs = Date.now();
  const defaultFrom = utcIsoDate(new Date(nowMs - 30 * 24 * 60 * 60 * 1000));
  const defaultTo = utcIsoDate(new Date(nowMs));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam ?? "") ? (fromParam as string) : defaultFrom;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam ?? "") ? (toParam as string) : defaultTo;
  if (!isArchive && from > to) {
    return NextResponse.json({ success: false, error: "from muss <= to sein" }, { status: 400 });
  }
  // Ende inklusive → wir nehmen den Beginn des Folgetags als exklusive obere Grenze
  // (deckt alle clock_in-Zeitstempel bis 23:59:59.999 UTC am `to`-Tag ab; DST-tolerant
  // genug fuer den Range-Filter). Im Archiv-Modus ungenutzt.
  const fromTs = new Date(`${from}T00:00:00Z`).toISOString();
  const toTs = new Date(new Date(`${to}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createClient();

  // Auftrags-Filter: job_number → job_id aufloesen (RLS haerte die
  // Sichtbarkeit ab; Nicht-Sehen liefert null → leerer Export).
  let jobIdFilter: string | null = null;
  const jobNumber = parseJobNumber(auftragParam);
  if (jobNumber !== null) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id")
      .eq("job_number", jobNumber)
      .maybeSingle();
    if (job && typeof (job as { id?: string }).id === "string") {
      jobIdFilter = (job as { id: string }).id;
    } else {
      // Auftrag nicht sichtbar / nicht existent → leeres Sheet ist besser als 404.
      jobIdFilter = "__missing__";
    }
  }

  let query = supabase
    .from("time_entries")
    .select("id, user_id, job_id, project_id, clock_in, clock_out, description, notes, job:jobs(job_number, title), project:projects(project_number, title)")
    .order("clock_in", { ascending: false });

  if (!isArchive) {
    query = query.gte("clock_in", fromTs).lt("clock_in", toTs);
  } else {
    // Archiv: harte Obergrenze — schuetzt vor OOM bei riesigen Historien.
    // 50k Rows entsprechen ca. 10 MB xlsx (grob geschaetzt); wer mehr braucht,
    // filtert per user/auftrag oder splittet in from/to-Fenster.
    query = query.limit(50000);
  }

  if (jobIdFilter) {
    // Auftrags-Filter dominiert (wie in der View — Auftrags-Ansicht zeigt bewusst
    // alle MA auf dem Auftrag, unabhaengig vom user-Param).
    query = query.eq("job_id", jobIdFilter);
  } else if (userParam === ALL_USERS_URL_VALUE) {
    // Alle via RLS sichtbaren Rows — kein user_id-Filter.
  } else if (userParam && UUID_RE.test(userParam)) {
    query = query.eq("user_id", userParam);
  } else {
    // Default = eigene (analog isOwnView im View — auch Admin sieht per Default
    // nur eigene; die Ansicht wechselt explizit via ?user=all).
    query = query.eq("user_id", auth.effectiveUserId); // dev-mode: effective user
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  const rows = (data as unknown as ExportRow[] | null) ?? [];

  // Namen-Map fuer MA-Spalte via SECURITY-DEFINER-RPC — profiles-RLS wuerde
  // einen direkten Join fuer Nicht-Admins blockieren.
  const namesMap = new Map<string, string>();
  const { data: usersRaw } = await supabase.rpc("get_assignable_users");
  for (const u of (usersRaw as { id: string; full_name: string }[] | null) ?? []) {
    namesMap.set(u.id, u.full_name);
  }

  // Excel bauen
  const wb = new ExcelJS.Workbook();
  wb.creator = "EVENTLINE FSM";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Stempelzeiten", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Datum",        key: "date",        width: 12 },
    { header: "Von",          key: "from",        width: 8 },
    { header: "Bis",          key: "to",          width: 10 },
    { header: "Dauer (h)",    key: "duration",    width: 10 },
    { header: "Mitarbeiter",  key: "user",        width: 24 },
    { header: "Auftrag",      key: "job",         width: 38 },
    { header: "Projekt",      key: "project",     width: 38 },
    { header: "Beschreibung", key: "description", width: 32 },
    { header: "Notiz",        key: "notes",       width: 28 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991010" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.height = 22;

  for (const r of rows) {
    const durationH = r.clock_out
      ? Math.round(((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3_600_000) * 100) / 100
      : null;
    const jobLabel = r.job ? `INT-${r.job.job_number} · ${r.job.title}` : "";
    const projLabel = r.project ? `${formatProjectNumber(r.project.project_number)} · ${r.project.title}` : "";
    sheet.addRow({
      date: fmtDate(r.clock_in),
      from: fmtTime(r.clock_in),
      to: r.clock_out ? fmtTime(r.clock_out) : "läuft…",
      duration: durationH !== null ? durationH : "",
      user: namesMap.get(r.user_id) ?? "—",
      job: jobLabel,
      project: projLabel,
      description: r.description ?? "",
      notes: r.notes ?? "",
    });
  }

  // Auto-Filter ueber alle Spalten (Excel-User kann sortieren/filtern)
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };

  const buffer = await wb.xlsx.writeBuffer();
  const filename = isArchive
    ? `stempelzeiten_archiv_${defaultTo}.xlsx`
    : `stempelzeiten_${from}_${to}.xlsx`;
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
