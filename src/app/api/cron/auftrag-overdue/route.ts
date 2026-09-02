// GET /api/cron/auftrag-overdue
//
// Taeglicher Cron (Vercel schedule "0 9 * * *" = 09:00 UTC → 10:00 ZRH
// Winter / 11:00 ZRH Sommer, kurz nach Buero-Start). Sucht ueberfaellige
// Auftraege und schickt zwei Eskalations-Stufen an alle zugewiesenen MA
// (aus job_appointments.assigned_to, dedupliziert pro Profil):
//
//   Tag +1 nach end_date → in-app Notification (job_overdue-Typ)
//   Tag +3 nach end_date → Email via Resend (Eskalation)
//
// Idempotenz: pro (job_id, kind) genau EINE Row in job_overdue_reminders
// (Migration 205). Cron skippt Auftraege, fuer die die Row schon existiert.
// So laeuft der Cron risikofrei taeglich, ohne Dubletten zu produzieren.
//
// Filter fuer "ueberfaellige Auftraege":
//   - status NOT IN ('abgeschlossen', 'storniert', 'entwurf', 'anfrage')
//     → nur echte, laufende Auftraege
//   - end_date IS NOT NULL
//   - end_date::date < heute (Europe/Zurich-Kalender)
//
// Rueckgabe: {total_notified, total_mailed, skipped, errors}.

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayLocalIso } from "@/lib/swiss-time";
import { notifyJobOverdueDay1 } from "@/lib/notification-service";
import { loadCompanySettings, formatMailFooter, formatMailFrom } from "@/lib/company-settings";
import { logError } from "@/lib/log";

const ACTIVE_STATUSES_EXCLUDED = ["abgeschlossen", "storniert", "entwurf", "anfrage"];

interface JobRow {
  id: string;
  job_number: number;
  title: string;
  end_date: string; // timestamptz
  status: string;
}

interface AssigneeRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** Tage-Differenz zwischen zwei YYYY-MM-DD-Strings im Europe/Zurich-Kalender. */
function daysBetweenIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

/** end_date liegt als timestamptz vor — fuer den Vergleich brauchen wir nur
 *  das ZRH-Datum. dateFormat aus swiss-time waere sauberer, aber die
 *  timestamptz aus der DB ist bereits UTC, und wir wollen den ZRH-Kalendertag
 *  der end_date. Die Zeit-Komponente (typisch 00:00 UTC) ist irrelevant. */
function endDateToLocalIso(endTs: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(endTs));
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET fehlt in der Server-Config" },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayLocalIso();

  // Alle Auftraege mit Enddatum vor heute und noch laufendem Status laden.
  // Wir vergleichen end_date als timestamptz gegen Mitternacht ZRH heute —
  // Kandidaten enthalten damit auch alles was heute morgen bereits vorbei
  // war. Der endgueltige Tage-Filter (=== 1, === 3) passiert unten in JS.
  const { data: jobs, error: jobsErr } = await admin
    .from("jobs")
    .select("id, job_number, title, end_date, status")
    .not("end_date", "is", null)
    .not("status", "in", `(${ACTIVE_STATUSES_EXCLUDED.map((s) => `"${s}"`).join(",")})`)
    .lt("end_date", `${today}T00:00:00+02:00`);
  if (jobsErr) {
    logError("cron.auftrag-overdue.load-jobs", jobsErr);
    return NextResponse.json({ error: jobsErr.message }, { status: 500 });
  }

  const overdueJobs = (jobs ?? []) as JobRow[];
  if (overdueJobs.length === 0) {
    return NextResponse.json({
      ok: true,
      today,
      candidates: 0,
      total_notified: 0,
      total_mailed: 0,
    });
  }

  // Alle bereits versendeten Reminder in EINEM Query holen — statt pro Job
  // eine Query, die skalieren wuerde uebel bei 100+ ueberfaelligen Auftraegen.
  const jobIds = overdueJobs.map((j) => j.id);
  const { data: existingReminders } = await admin
    .from("job_overdue_reminders")
    .select("job_id, kind")
    .in("job_id", jobIds);
  const alreadySent = new Set<string>();
  for (const r of (existingReminders ?? []) as Array<{ job_id: string; kind: string }>) {
    alreadySent.add(`${r.job_id}::${r.kind}`);
  }

  // Assignees pro Job laden — job_appointments.assigned_to dedupliziert
  // (mehrere Termine je Auftrag fuer denselben MA → EIN Reminder).
  const { data: apptRows } = await admin
    .from("job_appointments")
    .select("job_id, assigned_to")
    .in("job_id", jobIds)
    .not("assigned_to", "is", null);
  const assigneesByJob = new Map<string, Set<string>>();
  for (const r of (apptRows ?? []) as Array<{ job_id: string; assigned_to: string }>) {
    let set = assigneesByJob.get(r.job_id);
    if (!set) {
      set = new Set<string>();
      assigneesByJob.set(r.job_id, set);
    }
    set.add(r.assigned_to);
  }

  // Profil-Daten fuer alle betroffenen User in EINEM Query (Mail braucht
  // Name + Email, In-App-Notif braucht nur die id).
  const allUserIds = Array.from(new Set(
    Array.from(assigneesByJob.values()).flatMap((s) => Array.from(s)),
  ));
  const profilesById = new Map<string, AssigneeRow>();
  if (allUserIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", allUserIds)
      .eq("is_active", true);
    for (const p of (profileRows ?? []) as AssigneeRow[]) {
      profilesById.set(p.id, p);
    }
  }

  // Mail-Absender + Company nur EINMAL laden statt pro Auftrag.
  const company = await loadCompanySettings(admin);
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eventline-basel.com";

  let totalNotified = 0;
  let totalMailed = 0;
  let skipped = 0;
  const errors: Array<{ job_id: string; kind: string; error: string }> = [];

  for (const job of overdueJobs) {
    const endIso = endDateToLocalIso(job.end_date);
    const overdueDays = daysBetweenIso(endIso, today);

    // Nur an exakt Tag 1 bzw. Tag 3 versenden. Cron verpasst einen Tag
    // (Vercel-Cron-Ausfall) → dieser Reminder faellt aus. Bewusst: „grosser"
    // Retry ohne Idempotenz wuerde Auftraege 5 Tage lang jeden Tag anpingen.
    if (overdueDays !== 1 && overdueDays !== 3) {
      skipped++;
      continue;
    }

    const kind = overdueDays === 1 ? "notification" : "mail";
    if (alreadySent.has(`${job.id}::${kind}`)) {
      skipped++;
      continue;
    }

    const assigneeIds = Array.from(assigneesByJob.get(job.id) ?? []);
    if (assigneeIds.length === 0) {
      // Keine Zuweisung → nichts zu tun, aber trotzdem als Reminder-Row
      // eintragen, damit der Cron morgen nicht wieder rein-luft. Sonst
      // wuerden Auftraege ohne Assignee jeden Cron-Lauf durchlaufen.
      const { error: insErr } = await admin
        .from("job_overdue_reminders")
        .insert({ job_id: job.id, kind, sent_to_user_ids: [] });
      if (insErr && insErr.code !== "23505") {
        errors.push({ job_id: job.id, kind, error: insErr.message });
      }
      skipped++;
      continue;
    }

    try {
      if (kind === "notification") {
        await notifyJobOverdueDay1(admin, {
          recipients: assigneeIds,
          jobId: job.id,
          jobNumber: job.job_number,
          jobTitle: job.title,
          endDateIso: endIso,
        });
        totalNotified += assigneeIds.length;
      } else {
        // Tag +3 Mail: direkt via Resend, umgeht user_notification_settings.
        // Bewusste Eskalation — die In-App-Notif von Tag +1 ist verpufft,
        // jetzt muss die Mail zwingend raus, unabhaengig vom Kanal-Opt-in.
        if (!resend) {
          errors.push({ job_id: job.id, kind, error: "Kein RESEND_API_KEY" });
          continue;
        }
        const targets = assigneeIds
          .map((id) => profilesById.get(id))
          .filter((p): p is AssigneeRow & { email: string } => !!p && !!p.email);
        const link = `${appBaseUrl}/auftraege/${job.id}`;
        const endHuman = new Date(job.end_date).toLocaleDateString("de-CH", {
          timeZone: "Europe/Zurich",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const subject = `[EVENTLINE] Auftrag INT-${job.job_number} ist 3 Tage ueberfaellig`;
        const mailSent: string[] = [];
        for (const t of targets) {
          const greeting = t.full_name ? t.full_name.split(" ")[0] : "";
          try {
            await resend.emails.send({
              from: formatMailFrom(company, "noreply@eventline-basel.com"),
              to: t.email,
              subject,
              html: `
                <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
                  <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
                    <h2 style="color:white;margin:0;font-size:16px">${company.name}</h2>
                  </div>
                  <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
                    <p style="margin:0 0 12px">Hallo ${greeting || "zusammen"},</p>
                    <p style="margin:0 0 16px">Der Auftrag <strong>INT-${job.job_number} ${escapeHtml(job.title)}</strong> war fuer den <strong>${endHuman}</strong> geplant und ist noch nicht abgeschlossen.</p>
                    <p style="margin:0 0 20px">Bitte pruefe den Status und schliesse den Auftrag ab oder aktualisiere das Enddatum.</p>
                    <p style="margin:0 0 24px">
                      <a href="${link}" style="display:inline-block;padding:10px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Zum Auftrag</a>
                    </p>
                    <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
                    <p style="margin:0;color:#bbb;font-size:11px">${formatMailFooter(company)}</p>
                  </div>
                </div>
              `,
            });
            mailSent.push(t.id);
            totalMailed++;
          } catch (e) {
            logError("cron.auftrag-overdue.mail", e, { jobId: job.id, email: t.email });
            errors.push({
              job_id: job.id,
              kind,
              error: `mail to ${t.email}: ${e instanceof Error ? e.message : "unknown"}`,
            });
          }
        }
        // Wenn KEINE Mail durchging → Reminder-Row NICHT anlegen, damit
        // morgen ein Retry moeglich ist. Sonst wuerde man permanent
        // vergessenes RESEND_API_KEY-Setup nie mehr korrigiert bekommen.
        if (mailSent.length === 0) continue;
      }

      const sentUserIds = kind === "notification"
        ? assigneeIds
        : assigneeIds.filter((id) => {
            const p = profilesById.get(id);
            return !!p?.email;
          });

      const { error: insErr } = await admin
        .from("job_overdue_reminders")
        .insert({ job_id: job.id, kind, sent_to_user_ids: sentUserIds });
      // 23505 = unique_violation: eine zweite Cron-Instanz war schneller.
      // Nicht als Fehler zaehlen — Idempotenz-Kontrakt greift.
      if (insErr && insErr.code !== "23505") {
        errors.push({ job_id: job.id, kind, error: insErr.message });
      }
    } catch (e) {
      logError("cron.auftrag-overdue.deliver", e, { jobId: job.id, kind });
      errors.push({
        job_id: job.id,
        kind,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    candidates: overdueJobs.length,
    total_notified: totalNotified,
    total_mailed: totalMailed,
    skipped,
    errors,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
