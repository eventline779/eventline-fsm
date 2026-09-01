"use client";

/**
 * Auftrag-Detail: Tab "Uebersicht".
 *
 * Enthaelt Kopf-Info (Kunde / Standort / Datum / Kontakt / Beschreibung),
 * Notizen (Autosave), Verwaltungsaufwand (Autosave, Teamleiter-only)
 * und die Termine (AppointmentsSection).
 *
 * State fuer Notizen/Verwaltungsaufwand lebt bewusst im Parent — beim
 * Tab-Wechsel wird die OverviewTab unmounted; die Feldwerte muessen aber
 * ueber den Tab-Wechsel hinweg erhalten bleiben.
 */

import { MapPin, User, Calendar, UserCheck, StickyNote, Briefcase, Phone, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BexioButton } from "@/components/bexio-button";
import { AppointmentsSection } from "@/components/auftrag/appointments-section";
import type { JobAppointment, Profile, JobDetailWithRelations, JobStatus } from "@/types";

type Props = {
  jobId: string;
  job: JobDetailWithRelations;
  appointments: JobAppointment[];
  profiles: Profile[];
  autoOpenAppt: boolean;
  onReload: () => void;
  canEdit: boolean;
  notesText: string;
  setNotesText: (v: string) => void;
  verwaltungsText: string;
  setVerwaltungsText: (v: string) => void;
  verwaltungsMinutes: string;
  setVerwaltungsMinutes: (v: string) => void;
};

export function OverviewTab({
  jobId,
  job,
  appointments,
  profiles,
  autoOpenAppt,
  onReload,
  canEdit,
  notesText,
  setNotesText,
  verwaltungsText,
  setVerwaltungsText,
  verwaltungsMinutes,
  setVerwaltungsMinutes,
}: Props) {
  const customer = job.customer ?? job.location?.customer ?? undefined;
  const location = job.location ?? undefined;
  const room = job.room ?? undefined;
  const roomAddress = room
    ? [room.address_street, `${room.address_zip || ""} ${room.address_city || ""}`.trim()].filter(Boolean).join(", ")
    : "";
  const locationAddress = location
    ? [location.address_street, `${location.address_zip || ""} ${location.address_city || ""}`.trim()]
        .filter(Boolean)
        .join(", ")
    : "";
  const customerAddress = job.customer
    ? [job.customer.address_street, `${job.customer.address_zip || ""} ${job.customer.address_city || ""}`.trim()]
        .filter(Boolean)
        .join(", ")
    : "";
  const mapsAddress = locationAddress || roomAddress || job.external_address || customerAddress;
  const mapsQuery = mapsAddress || location?.name || room?.name || customer?.name || "";
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : "";
  const projectLead = job.project_lead;

  return (
    <div className="space-y-6">
      {/* Info */}
      <Card className="bg-card">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">Kunde:</span>
                <span className="truncate">{customer?.name ?? "—"}</span>
              </div>
              {customerAddress && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{customerAddress}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {job.customer?.id && (
                <BexioButton
                  customerId={job.customer.id}
                  bexioContactId={job.customer.bexio_contact_id ?? null}
                  onLinked={onReload}
                />
              )}
              {!location && mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="kasten kasten-blue">
                  <MapPin className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              )}
            </div>
          </div>
          {location && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">Standort:</span>
                  <span className="truncate">{location.name}</span>
                </div>
                {locationAddress && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{locationAddress}</span>
                  </div>
                )}
              </div>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="kasten kasten-blue shrink-0">
                  <MapPin className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              )}
            </div>
          )}
          {!location && room && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">Raum:</span>
                  <span className="truncate">{room.name}</span>
                </div>
                {roomAddress && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{roomAddress}</span>
                  </div>
                )}
              </div>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="kasten kasten-blue shrink-0">
                  <MapPin className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              )}
            </div>
          )}
          {!location && !room && job.external_address && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium">Ort:</span>
              <span className="truncate">{job.external_address}</span>
            </div>
          )}
          {projectLead && (
            <div className="flex items-center gap-2 text-sm">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Projektleiter:</span> {projectLead.full_name}
            </div>
          )}
          {job.start_date && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Event-Datum:</span>{" "}
              {new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}{" "}
              {job.end_date && job.end_date !== job.start_date
                ? `– ${new Date(job.end_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}`
                : ""}
            </div>
          )}
          {(job.contact_person || job.contact_phone || job.contact_email) && (
            <div className="pt-2 border-t space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Veranstalter-Kontakt
              </p>
              {job.contact_person && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{job.contact_person}</span>
                </div>
              )}
              {job.contact_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`tel:${job.contact_phone.replace(/\s+/g, "")}`}
                    className="hover:underline tabular-nums"
                  >
                    {job.contact_phone}
                  </a>
                </div>
              )}
              {job.contact_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${job.contact_email}`} className="hover:underline truncate">
                    {job.contact_email}
                  </a>
                </div>
              )}
            </div>
          )}
          {job.description && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">{job.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notizen — autosave via Parent-Effekt (Debounce 800ms) */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Notizen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Reinschreiben — wird automatisch gespeichert."
            rows={4}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
          />
        </CardContent>
      </Card>

      {/* Verwaltungsaufwand — nur Teamleiter/Admin editieren */}
      {(canEdit || verwaltungsText || verwaltungsMinutes) && (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Verwaltungsaufwand
              {!canEdit && (
                <span className="text-[10px] font-normal text-muted-foreground/60 ml-1">
                  nur Teamleiter editierbar
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <div className="flex gap-2 items-start">
                <div className="flex flex-col items-center shrink-0">
                  <label className="text-[10px] font-medium text-muted-foreground/70 mb-1">Minuten</label>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={verwaltungsMinutes}
                    onChange={(e) => setVerwaltungsMinutes(e.target.value)}
                    placeholder="0"
                    className="w-20 px-2 py-2 text-sm text-center rounded-xl border bg-background transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                  />
                  {verwaltungsMinutes && parseInt(verwaltungsMinutes, 10) >= 60 && (
                    <span className="text-[10px] text-muted-foreground/60 mt-1 tabular-nums">
                      = {Math.floor(parseInt(verwaltungsMinutes, 10) / 60)}h{" "}
                      {parseInt(verwaltungsMinutes, 10) % 60 > 0
                        ? `${parseInt(verwaltungsMinutes, 10) % 60}m`
                        : ""}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-muted-foreground/70 mb-1 block">
                    Tätigkeit
                  </label>
                  <textarea
                    value={verwaltungsText}
                    onChange={(e) => setVerwaltungsText(e.target.value)}
                    placeholder="z.B. 3 Offerten-Iterationen, 8x Telefonate, Sonderwunsch Buehne — wird automatisch gespeichert + im Rapport ausgewiesen."
                    rows={3}
                    style={{ fieldSizing: "content" } as React.CSSProperties}
                    className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {verwaltungsMinutes && parseInt(verwaltungsMinutes, 10) > 0 && (() => {
                  const m = parseInt(verwaltungsMinutes, 10);
                  const label =
                    m >= 60
                      ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ""}`
                      : `${m} Min`;
                  return (
                    <p className="text-xs">
                      <span className="font-semibold text-muted-foreground">Aufwand: </span>
                      <span className="font-mono tabular-nums">{label.trim()}</span>
                    </p>
                  );
                })()}
                {verwaltungsText && (
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{verwaltungsText}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AppointmentsSection
        jobId={jobId}
        jobTitle={job?.title ?? null}
        jobStatus={job.status as JobStatus}
        jobStartDate={job.start_date ?? null}
        appointments={appointments}
        profiles={profiles}
        onReload={onReload}
        defaultOpen={autoOpenAppt}
      />
    </div>
  );
}
