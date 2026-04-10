import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Rapport laden
  const { data: report } = await supabase
    .from("service_reports")
    .select("*, job:jobs(title, job_number, customer:customers(name))")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Rapport nicht gefunden" }, { status: 404 });
  }

  const job = report.job as any;
  const jobNumber = job?.job_number || "?";
  const customerName = job?.customer?.name || "Unbekannt";

  // PDF generieren (intern aufrufen)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const pdfRes = await fetch(`${baseUrl}/api/reports/${id}/pdf`);
  if (!pdfRes.ok) {
    return NextResponse.json({ error: "PDF konnte nicht generiert werden" }, { status: 500 });
  }
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  // PDF in Supabase Storage speichern
  const pdfPath = `rapporte/Rapport_${jobNumber}_${id}.pdf`;
  await supabase.storage.from("documents").upload(pdfPath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  // PDF-URL im Rapport speichern
  await supabase.from("service_reports").update({ pdf_url: pdfPath }).eq("id", id);

  // PDF als Dokument am Auftrag anhängen
  const { data: existingDoc } = await supabase
    .from("documents")
    .select("id")
    .eq("storage_path", pdfPath)
    .single();

  if (!existingDoc) {
    // Einen Admin-User für uploaded_by finden
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .single();

    if (adminProfile) {
      await supabase.from("documents").insert({
        name: `Einsatzrapport #${jobNumber}.pdf`,
        storage_path: pdfPath,
        file_size: pdfBuffer.length,
        mime_type: "application/pdf",
        job_id: report.job_id,
        uploaded_by: adminProfile.id,
      });
    }
  }

  // E-Mail senden via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "EVENTLINE FSM <onboarding@resend.dev>",
        to: "leo@eventline-basel.com",
        subject: `Rechnung stellen #${jobNumber} – ${customerName}`,
        html: `
          <p>Hallo Buchhaltung,</p>
          <p>Der Auftrag <strong>#${jobNumber} – ${job?.title || ""}</strong> wurde abgeschlossen.</p>
          <p><strong>Kunde:</strong> ${customerName}</p>
          <p>Im Anhang findest du den Einsatzrapport als PDF.</p>
          <p>Bitte Rechnung stellen.</p>
          <br/>
          <p>Freundliche Grüsse<br/>EVENTLINE FSM</p>
        `,
        attachments: [
          {
            filename: `Einsatzrapport_${jobNumber}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      });

      return NextResponse.json({ success: true, emailSent: true });
    } catch (emailError: any) {
      // PDF wurde gespeichert, aber E-Mail hat nicht geklappt
      return NextResponse.json({
        success: true,
        emailSent: false,
        emailError: emailError.message,
      });
    }
  }

  // Kein Resend-Key → nur PDF gespeichert
  return NextResponse.json({ success: true, emailSent: false, noApiKey: true });
}
