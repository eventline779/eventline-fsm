export type UserRole = "admin" | "techniker";

export type JobStatus = "anfrage" | "entwurf" | "offen" | "abgeschlossen" | "storniert";

export type JobPriority = "normal" | "dringend";

export type CustomerType = "company" | "individual" | "organization";


export type ReportStatus = "entwurf" | "abgeschlossen";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  type: CustomerType;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  /** ISO-2-Land-Code, z.B. 'CH', 'DE'. Default 'CH'. Wird per Google-Maps-
   *  Autocomplete automatisch befuellt, kann manuell ueberschrieben werden. */
  address_country: string;
  /** Verknuepfung zu Bexio-Kontakt. Gesetzt sobald Sync erfolgt. */
  bexio_contact_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name: string;
  address_street: string | null;
  address_zip: string | null;
  address_city: string;
  capacity: number | null;
  customer_id: string | null;
  notes: string | null;
  technical_details: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  job_number: number | null;
  title: string;
  description: string | null;
  status: JobStatus;
  priority: JobPriority;
  /** 'location' = Auftrag in unserem Standort (location_id gesetzt, customer_id i.d.R. NULL,
   *  Verwaltungs-Kunde kommt ueber locations.customer_id).
   *  'extern'   = Auftrag fuer externen Kunden — entweder room_id (bekannter Raum)
   *  oder external_address (freie Adresse) ist gesetzt. */
  job_type: "location" | "extern";
  /** Bei location-Auftraegen typisch NULL — der Verwaltungs-Kunde aus
   *  locations.customer_id ist die Quelle der Wahrheit. Bei extern-Auftraegen Pflicht. */
  customer_id: string | null;
  location_id: string | null;
  /** Bei job_type='extern': optional ein bekannter Raum aus der rooms-Tabelle.
   *  Wenn gesetzt, wird die Adresse vom Raum gezogen — sonst external_address als Freitext. */
  room_id: string | null;
  /** Freie Adresse fuer extern-Auftraege ohne hinterlegten Raum. */
  external_address: string | null;
  project_lead_id: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  is_deleted: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Anfrage-Phase (gefuellt wenn status='anfrage')
  request_step: 1 | 2 | 3 | 4 | 5 | null;
  event_type: string | null;
  guest_count: number | null;
  extended_services: string | null;
  // Bleibt TRUE auch nach Konvertierung/Stornierung — fuer Lifecycle-Auswertung der Mietanfragen
  was_anfrage: boolean;
  // Storno-Metadaten — gefuellt wenn status='storniert'
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  // TRUE wenn die Stornierung in der Anfrage-Phase passierte — solche Jobs gehoeren nicht ins Auftrags-Archiv.
  cancelled_as_anfrage: boolean;
  // Joined data
  customer?: Customer;
  location?: Location;
  room?: Room;
  assignments?: JobAssignment[];
  project_lead?: Profile;
  appointments?: JobAppointment[];
  cancelled_by_profile?: { full_name: string };
}

// === Join-Shapes fuer Supabase-Query-Resultate ===
// Wenn man `.select("*, customer:customers(name, email), ...")` macht, liefert
// Supabase nur die expliziten Felder. Das full Customer-Interface waere ein
// Lie. Deshalb hier schmale Join-Typen die genau das beschreiben was die
// jeweilige Query selektiert.
//
// Vorher: ueberall `as unknown as { name: string }` Casts. Nachher: ein paar
// klar benannte Typen die du in der Query und im Render-Code wiederverwendest.

/** Was wir typisch in Listen- und Detail-Joins vom Customer selektieren. */
export type JobCustomerSummary = Pick<
  Customer,
  | "id"
  | "name"
  | "email"
  | "address_street"
  | "address_zip"
  | "address_city"
  | "address_country"
  | "bexio_contact_id"
>;

/** Verwaltungs-Kunde eines Standorts — wird ueberall mitgejoint, damit
 *  Location-Auftraege (jobs.customer_id = NULL) trotzdem einen Kundennamen
 *  anzeigen koennen (= der Standort-Betreiber, der die Rechnung bekommt). */
export type LocationAdminCustomer = Pick<Customer, "id" | "name">;

/** Was wir typisch vom Location-Join selektieren. Inkludiert immer den
 *  Verwaltungs-Kunden, sodass die UI ueberall denselben Fallback anwenden kann. */
export type JobLocationSummary = Pick<
  Location,
  "id" | "name" | "address_street" | "address_zip" | "address_city"
> & {
  customer: LocationAdminCustomer | null;
};

/** Was wir typisch vom Room-Join selektieren. Spiegelt Location-Summary fuer
 *  konsistente Adress-Anzeige (das gleiche Pattern in Liste + Detail). */
export type JobRoomSummary = Pick<
  Room,
  "id" | "name" | "address_street" | "address_zip" | "address_city"
>;

/** Job + joined customer/location/room/appointments wie auf der Auftrags-Liste.
 *  Location-Join inkludiert id+name und den Verwaltungs-Kunden (Fallback). */
export type JobWithRelations = Omit<Job, "customer" | "location" | "room" | "appointments"> & {
  customer: JobCustomerSummary | null;
  location: (Pick<Location, "id" | "name"> & { customer: LocationAdminCustomer | null }) | null;
  room: Pick<Room, "id" | "name"> | null;
  appointments?: Pick<JobAppointment, "id" | "start_time">[] | null;
};

/** Job + reichere Joins fuer die Auftrags-Detail-Seite. */
export type JobDetailWithRelations = Omit<
  Job,
  "customer" | "location" | "room" | "project_lead" | "cancelled_by_profile"
> & {
  customer: JobCustomerSummary | null;
  location: JobLocationSummary | null;
  room: JobRoomSummary | null;
  project_lead: { full_name: string } | null;
  cancelled_by_profile: { full_name: string } | null;
};

export interface JobAppointment {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  assigned_to: string | null;
  is_done: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  assignee?: Profile;
}

export interface JobAssignment {
  id: string;
  job_id: string;
  profile_id: string;
  role_on_job: string;
  notes: string | null;
  created_at: string;
  // Joined
  profile?: Profile;
}

export interface TimeEntry {
  id: string;
  profile_id: string;
  job_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  profile?: Profile;
  job?: Job;
}

export interface ServiceReport {
  id: string;
  job_id: string;
  created_by: string;
  report_date: string;
  work_description: string;
  equipment_used: string | null;
  issues: string | null;
  client_name: string | null;
  signature_url: string | null;
  technician_name: string | null;
  technician_signature_url: string | null;
  status: ReportStatus;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  job?: Job;
  photos?: ReportPhoto[];
  creator?: Profile;
}

export interface ReportPhoto {
  id: string;
  report_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface Document {
  id: string;
  name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  job_id: string | null;
  location_id: string | null;
  customer_id: string | null;
  uploaded_by: string;
  created_at: string;
}

// RentalRequest-Type entfernt — Vermietungsanfragen sind jetzt jobs mit
// status='anfrage' und request_step 1..5 (siehe REQUEST_STEPS in constants.ts).

export interface LocationContact {
  id: string;
  location_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface MaintenanceTask {
  id: string;
  location_id: string;
  title: string;
  description: string | null;
  status: "offen" | "erledigt";
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: "offen" | "erledigt";
  priority: JobPriority;
  due_date: string | null;
  assigned_to: string | null;
  job_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assignee?: Profile;
  job?: Job;
}

export type VertriebStatus = "offen" | "kontaktiert" | "gespraech" | "gewonnen" | "abgesagt";
export type VertriebPriority = "top" | "gut" | "mittel";
export type VertriebKategorie = "verwaltung" | "veranstaltung";

export interface VertriebContact {
  id: string;
  nr: number;
  firma: string;
  branche: string | null;
  ansprechperson: string | null;
  position: string | null;
  email: string | null;
  telefon: string | null;
  event_typ: string | null;
  status: VertriebStatus;
  datum_kontakt: string | null;
  notizen: string | null;
  prioritaet: VertriebPriority;
  kategorie: VertriebKategorie;
  step: number;
  verloren_grund: string | null;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  capacity: number | null;
  technical_details: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomContact {
  id: string;
  room_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface RoomPrice {
  id: string;
  room_id: string;
  label: string;
  amount: number;
  currency: string;
  notes: string | null;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  type: "bestätigung" | "absage" | "info";
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  rental_request_id: string | null;
  recipient: string;
  subject: string;
  body: string;
  sent_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  job_id: string | null;
  location_id: string | null;
  profile_id: string | null;
  color: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
