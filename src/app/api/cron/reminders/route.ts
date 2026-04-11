import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET(request: Request) {
  // Cron-Secret prüfen (Vercel Cron sendet diesen Header)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !process.env.VERCEL_URL?.includes("localhost")) {
    // Erlaube auch ohne Secret falls keins gesetzt ist
    if (process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "Kein RESEND_API_KEY" });
  }

  const resend = new Resend(resendKey);

  // Morgen berechnen
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Todos finden die morgen fällig sind, noch offen, und jemandem zugewiesen
  const { data: todos } = await supabase
    .from("todos")
    .select("*, assignee:profiles!assigned_to(full_name, email)")
    .eq("status", "offen")
    .eq("due_date", tomorrowStr)
    .not("assigned_to", "is", null);

  if (!todos || todos.length === 0) {
    return NextResponse.json({ success: true, message: "Keine Erinnerungen zu senden", count: 0 });
  }

  const sent: string[] = [];
  const failed: string[] = [];

  for (const todo of todos) {
    const assignee = (todo as any).assignee;
    if (!assignee?.email) continue;

    const formattedDate = new Date(todo.due_date + "T12:00:00").toLocaleDateString("de-CH", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    try {
      await resend.emails.send({
        from: "EVENTLINE FSM <noreply@eventline-basel.com>",
        to: assignee.email,
        subject: `Erinnerung: ${todo.title} – fällig morgen`,
        html: `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH</h2>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
              <p style="margin:0 0 12px">Hallo ${assignee.full_name},</p>
              <p style="margin:0 0 16px">Du hast eine Aufgabe die <strong>morgen fällig</strong> ist:</p>
              <div style="background:#f5f5f5;padding:16px;border-radius:8px;border-left:4px solid #ef4444;margin:0 0 16px">
                <p style="margin:0 0 4px;font-weight:600;font-size:16px">${todo.title}</p>
                <p style="margin:0 0 4px;color:#666">Fällig: ${formattedDate}</p>
                ${todo.description ? `<p style="margin:8px 0 0;color:#666;font-size:14px">${todo.description}</p>` : ""}
              </div>
              <p style="margin:0 0 8px;color:#999;font-size:13px">
                Öffne die App um die Aufgabe zu bearbeiten.
              </p>
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
              <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
            </div>
          </div>
        `,
      });
      sent.push(`${assignee.full_name}: ${todo.title}`);
    } catch {
      failed.push(assignee.email);
    }
  }

  return NextResponse.json({
    success: true,
    count: sent.length,
    sent,
    failed,
  });
}
