import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { jsPDF } from "jspdf";

interface TimeRange {
  date: string;
  start: string;
  end: string;
  pause: number;
}

function generatePDF(report: any, job: any, customer: any, location: any): Buffer {
  const timeRanges: TimeRange[] = report.time_ranges || [];
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Einsatzrapport", 14, y);

  if (job?.job_number) {
    doc.setFontSize(12);
    doc.setTextColor(150);
    doc.text(`#${job.job_number}`, pageWidth - 14, y, { align: "right" });
    doc.setTextColor(0);
  }

  y += 10;
  doc.setDrawColor(220);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Auftrag:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(job?.title || "-", 55, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Kunde:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(customer?.name || "-", 55, y);

  if (customer?.address_street) {
    y += 5;
    doc.text(`${customer.address_street}, ${customer.address_zip || ""} ${customer.address_city || ""}`, 55, y);
  }

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Standort:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(location?.name || "-", 55, y);

  // Einsatzzeiten
  if (timeRanges.length > 0) {
    y += 10;
    doc.setDrawColor(220);
    doc.line(14, y, pageWidth - 14, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Einsatzzeiten", 14, y);
    y += 7;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120);
    doc.text("Datum", 14, y);
    doc.text("Von", 65, y);
    doc.text("Bis", 90, y);
    doc.text("Pause", 115, y);
    doc.text("Arbeitszeit", 145, y);
    doc.setTextColor(0);
    y += 2;
    doc.setDrawColor(230);
    doc.line(14, y, pageWidth - 14, y);

    let totalMin = 0;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    for (const tr of timeRanges) {
      y += 5;
      const dateStr = new Date(tr.date + "T12:00:00").toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
      const [sh, sm] = tr.start.split(":").map(Number);
      const [eh, em] = tr.end.split(":").map(Number);
      const workMin = (eh * 60 + em) - (sh * 60 + sm) - tr.pause;
      totalMin += Math.max(0, workMin);
      const workH = Math.floor(workMin / 60);
      const workM = workMin % 60;
      doc.text(dateStr, 14, y);
      doc.text(`${tr.start} Uhr`, 65, y);
      doc.text(`${tr.end} Uhr`, 90, y);
      doc.text(`${tr.pause} Min`, 115, y);
      doc.text(`${workH}h ${workM > 0 ? workM + "m" : ""}`.trim(), 145, y);
    }

    y += 3;
    doc.setDrawColor(200);
    doc.line(14, y, pageWidth - 14, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Total", 14, y);
    const totalH = Math.floor(totalMin / 60);
    const totalM = totalMin % 60;
    doc.text(`${totalH}h ${totalM > 0 ? totalM + "m" : ""}`.trim(), 145, y);
    doc.setFont("helvetica", "normal");
  } else {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Datum:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(new Date(report.report_date).toLocaleDateString("de-CH"), 55, y);
  }

  y += 8;
  doc.setDrawColor(220);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Ausgeführte Arbeiten", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const workLines = doc.splitTextToSize(report.work_description || "-", pageWidth - 28);
  doc.text(workLines, 14, y);
  y += workLines.length * 5 + 4;

  if (report.equipment_used) {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Eingesetztes Material", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const equipLines = doc.splitTextToSize(report.equipment_used, pageWidth - 28);
    doc.text(equipLines, 14, y);
    y += equipLines.length * 5 + 4;
  }

  if (report.issues) {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Probleme / Bemerkungen", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const issueLines = doc.splitTextToSize(report.issues, pageWidth - 28);
    doc.text(issueLines, 14, y);
    y += issueLines.length * 5 + 4;
  }

  y = Math.max(y + 10, 220);
  doc.setDrawColor(220);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;
  doc.setFontSize(10);

  doc.setFont("helvetica", "bold");
  doc.text("Service-Techniker:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(report.technician_name || "-", 14, y + 5);
  doc.setDrawColor(180);
  doc.line(14, y + 20, 90, y + 20);
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("Unterschrift Techniker", 14, y + 24);

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("Kunde / Auftraggeber:", 110, y);
  doc.setFont("helvetica", "normal");
  doc.text(report.client_name || "-", 110, y + 5);
  doc.line(110, y + 20, pageWidth - 14, y + 20);
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("Unterschrift Kunde", 110, y + 24);

  doc.setTextColor(150);
  doc.setFontSize(7);
  doc.text(
    "EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel · Tel: 055 556 62 61 · www.eventline-basel.com",
    pageWidth / 2, 285, { align: "center" }
  );

  return Buffer.from(doc.output("arraybuffer"));
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Rapport mit Details laden
  const { data: report } = await supabase
    .from("service_reports")
    .select("*, job:jobs(title, job_number, customer:customers(name, address_street, address_zip, address_city), location:locations(name))")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Rapport nicht gefunden" }, { status: 404 });
  }

  const job = report.job as any;
  const customer = job?.customer;
  const location = job?.location;
  const jobNumber = job?.job_number || "?";
  const customerName = customer?.name || "Unbekannt";

  // PDF direkt generieren (kein interner HTTP-Call)
  const pdfBuffer = generatePDF(report, job, customer, location);

  // PDF in Supabase Storage speichern
  const pdfPath = `rapporte/Rapport_${jobNumber}_${id}.pdf`;
  await supabase.storage.from("documents").upload(pdfPath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  await supabase.from("service_reports").update({ pdf_url: pdfPath }).eq("id", id);

  // PDF als Dokument am Auftrag anhängen
  const { data: existingDoc } = await supabase
    .from("documents")
    .select("id")
    .eq("storage_path", pdfPath)
    .single();

  if (!existingDoc) {
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

  // E-Mail senden
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "EVENTLINE FSM <noreply@eventline-basel.com>",
        to: "buchhaltung@eventline-basel.com",
        subject: `Rechnung stellen #${jobNumber} – ${customerName}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto;">
            <div style="background: #1a1a1a; padding: 20px 24px; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0; font-size: 16px;">EVENTLINE GmbH</h2>
            </div>
            <div style="background: white; padding: 24px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 12px;">Hallo Buchhaltung,</p>
              <p style="margin: 0 0 16px;">Der Auftrag <strong>#${jobNumber} – ${job?.title || ""}</strong> wurde abgeschlossen.</p>
              <div style="background: #f5f5f5; padding: 14px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 0 0 16px;">
                <p style="margin: 0 0 4px; font-weight: 600;">Kunde: ${customerName}</p>
                <p style="margin: 0; color: #666; font-size: 14px;">Einsatzrapport im Anhang als PDF</p>
              </div>
              <p style="margin: 0 0 8px;">Bitte Rechnung stellen.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
              <p style="margin: 0; color: #bbb; font-size: 11px;">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
            </div>
          </div>
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
      return NextResponse.json({
        success: true,
        emailSent: false,
        emailError: emailError.message,
      });
    }
  }

  return NextResponse.json({ success: true, emailSent: false, noApiKey: true });
}
