import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requirePermission } from "@/lib/api-auth";
import { loadCompanySettings, formatMailFooter, formatMailFrom } from "@/lib/company-settings";

export async function POST(request: Request) {
  // Audit-Fix g1: vorher nur requireUser() — Todo-Mailinhalt (Titel/Text/
  // Faellig/Empfaenger) war vollstaendig client-kontrolliert. Jetzt:
  //   1. todos:create-Gate (nur wer Todos anlegt),
  //   2. todo_id im Body Pflicht,
  //   3. Todo per USER-Client (RLS) laden → wer den Todo nicht sehen darf,
  //      kann auch keine Mail dazu triggern,
  //   4. Titel/Beschreibung/Faelligkeit/Assignee kommen aus der DB (nicht
  //      vom Client) → kein Phishing-Vector mehr ueber unsere Domain.
  const auth = await requirePermission("todos:create");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const todoId = typeof body?.todo_id === "string" ? body.todo_id : null;

  if (!todoId || !/^[0-9a-f-]{36}$/i.test(todoId)) {
    return NextResponse.json({ success: false, error: "todo_id fehlt oder ungueltig" }, { status: 400 });
  }

  // Todo per User-Client laden — RLS entscheidet, ob der User diesen Todo
  // sehen darf. Kein Sichtrecht -> kein Trigger.
  const userClient = await createClient();
  const { data: todo } = await userClient
    .from("todos")
    .select("id, title, description, due_date, assigned_to")
    .eq("id", todoId)
    .maybeSingle();

  if (!todo || !todo.assigned_to) {
    return NextResponse.json({ success: false, error: "Todo nicht gefunden" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ success: false, error: "Kein RESEND_API_KEY" });

  const resend = new Resend(resendKey);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, is_active")
    .eq("id", todo.assigned_to)
    .single();

  if (!profile?.email || profile.is_active === false) {
    return NextResponse.json({ success: false, error: "Kein Profil gefunden" });
  }

  const dateStr = todo.due_date
    ? new Date(todo.due_date + "T12:00:00Z").toLocaleDateString("de-CH", {
        timeZone: "Europe/Zurich", weekday: "long", day: "numeric", month: "long", year: "numeric",
      })
    : null;

  const company = await loadCompanySettings(supabase);
  try {
    await resend.emails.send({
      from: formatMailFrom(company, "noreply@eventline-basel.com"),
      to: profile.email,
      subject: `DRINGEND: ${todo.title}`,
      html: `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">${company.name}</h2>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <p style="margin:0 0 12px">Hallo ${profile.full_name},</p>
            <p style="margin:0 0 16px">Dir wurde ein <strong style="color:#dc2626">dringendes Todo</strong> zugewiesen:</p>
            <div style="background:#fef2f2;padding:16px;border-radius:8px;border-left:4px solid #dc2626;margin:0 0 16px">
              <p style="margin:0 0 4px;font-weight:600;font-size:16px">${todo.title}</p>
              ${todo.description ? `<p style="margin:4px 0 0;color:#666;font-size:14px">${todo.description}</p>` : ""}
              ${dateStr ? `<p style="margin:8px 0 0;color:#dc2626;font-size:13px;font-weight:500">Fällig: ${dateStr}</p>` : ""}
            </div>
            <p style="margin:0 0 8px;color:#999;font-size:13px">Öffne die App für weitere Details.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
            <p style="margin:0;color:#bbb;font-size:11px">${formatMailFooter(company)}</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "E-Mail fehlgeschlagen" });
  }
}
