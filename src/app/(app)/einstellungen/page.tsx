"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { USER_ROLES } from "@/lib/constants";
import type { Profile } from "@/types";
import {
  UserPlus,
  Shield,
  User,
  X,
  Mail,
  Phone,
  Users,
  Clock,
  Play,
  Calendar,
  Plus,
  Trash2,
  Download,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

type Tab = "team" | "zeiten" | "schichten" | "backup";

const TEAM_PRESETS = [
  { name: "Dario", email: "dario@eventline-basel.com", role: "admin" as const },
  { name: "Mischa", email: "mischa@eventline-basel.com", role: "admin" as const },
  { name: "Tim", email: "tim@eventline-basel.com", role: "admin" as const },
];

interface TeamTimeEntry {
  id: string;
  profile_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  job: { title: string } | null;
  profile: { full_name: string; role: string } | null;
}

interface Shift {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  profile_id: string | null;
  profile?: { full_name: string } | null;
  color: string | null;
}

export default function EinstellungenPage() {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(urlTab && ["team", "zeiten", "schichten", "backup"].includes(urlTab) ? urlTab : "team");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "techniker">("techniker");
  const [saving, setSaving] = useState(false);

  // Zeiten
  const [timeEntries, setTimeEntries] = useState<TeamTimeEntry[]>([]);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState("heute");

  // Schichten
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftFilter, setShiftFilter] = useState("woche");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split("T")[0]);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    title: "",
    start_time: "08:00",
    end_time: "17:00",
    profile_id: "",
  });

  const supabase = createClient();

  // Sync tab from URL when navigating via sidebar
  useEffect(() => {
    if (urlTab && ["team", "zeiten", "schichten", "backup"].includes(urlTab)) {
      setTab(urlTab);
    } else if (!urlTab) {
      setTab("team");
    }
  }, [urlTab]);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (tab === "zeiten") loadTimeEntries();
    if (tab === "schichten") loadShifts();
  }, [tab, timeFilter, shiftFilter]);

  async function loadProfiles() {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    if (data) setProfiles(data as Profile[]);
    setLoading(false);
  }

  async function loadTimeEntries() {
    setTimeLoading(true);
    let query = supabase
      .from("time_entries")
      .select("id, profile_id, clock_in, clock_out, break_minutes, notes, job:jobs(title), profile:profiles(full_name, role)")
      .order("clock_in", { ascending: false })
      .limit(50);

    if (timeFilter === "heute") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte("clock_in", today.toISOString());
    } else if (timeFilter === "woche") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte("clock_in", weekAgo.toISOString());
    } else if (timeFilter === "monat") {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query = query.gte("clock_in", monthAgo.toISOString());
    }

    const { data } = await query;
    if (data) setTimeEntries(data as unknown as TeamTimeEntry[]);
    setTimeLoading(false);
  }

  async function loadShifts() {
    setShiftLoading(true);
    const now = new Date();
    let startDate: string;
    let endDate: string;

    if (shiftFilter === "woche") {
      const dayOfWeek = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      startDate = monday.toISOString().split("T")[0] + "T00:00:00";
      endDate = sunday.toISOString().split("T")[0] + "T23:59:59";
    } else {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate = `${lastDay.toISOString().split("T")[0]}T23:59:59`;
    }

    const { data } = await supabase
      .from("calendar_events")
      .select("id, title, start_time, end_time, profile_id, color, profile:profiles(full_name)")
      .gte("start_time", startDate)
      .lte("start_time", endDate)
      .order("start_time");
    if (data) setShifts(data as unknown as Shift[]);
    setShiftLoading(false);
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data, error } = await supabase.auth.signUp({
      email: newEmail,
      password: newPassword,
      options: { data: { full_name: newName, role: newRole } },
    });

    if (error) {
      toast.error("Fehler: " + error.message);
      setSaving(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").update({ role: newRole, full_name: newName }).eq("id", data.user.id);
    }

    toast.success(`${newName} wurde erfolgreich erstellt`);
    setShowAdd(false);
    setNewEmail("");
    setNewPassword("");
    setNewName("");
    setNewRole("techniker");
    loadProfiles();
    setSaving(false);
  }

  async function toggleRole(profile: Profile) {
    const newRole = profile.role === "admin" ? "techniker" : "admin";
    await supabase.from("profiles").update({ role: newRole }).eq("id", profile.id);
    toast.success(`${profile.full_name} ist jetzt ${USER_ROLES[newRole]}`);
    loadProfiles();
  }

  function prefillUser(preset: (typeof TEAM_PRESETS)[0]) {
    setNewName(preset.name);
    setNewEmail(preset.email);
    setNewRole(preset.role);
    setShowAdd(true);
  }

  async function createShift(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    const assignee = profiles.find((p) => p.id === shiftForm.profile_id);
    const shiftTitle = shiftForm.title || `Schicht ${assignee?.full_name || ""}`;

    const { error } = await supabase.from("calendar_events").insert({
      title: shiftTitle,
      start_time: (() => { const o = -new Date().getTimezoneOffset(); const s = o >= 0 ? "+" : "-"; const h = String(Math.floor(Math.abs(o) / 60)).padStart(2, "0"); const m = String(Math.abs(o) % 60).padStart(2, "0"); return `${shiftDate}T${shiftForm.start_time}:00${s}${h}:${m}`; })(),
      end_time: (() => { const o = -new Date().getTimezoneOffset(); const s = o >= 0 ? "+" : "-"; const h = String(Math.floor(Math.abs(o) / 60)).padStart(2, "0"); const m = String(Math.abs(o) % 60).padStart(2, "0"); return `${shiftDate}T${shiftForm.end_time}:00${s}${h}:${m}`; })(),
      profile_id: shiftForm.profile_id || null,
      color: "#ef4444",
      created_by: user?.id,
      all_day: false,
    });

    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }

    toast.success("Schicht erstellt");

    // E-Mail an zugeteilten Mitarbeiter senden
    if (shiftForm.profile_id) {
      try {
        const res = await fetch("/api/shifts/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: shiftForm.profile_id,
            shift_title: shiftTitle,
            shift_date: shiftDate,
            start_time: shiftForm.start_time,
            end_time: shiftForm.end_time,
          }),
        });
        const result = await res.json();
        if (result.emailSent) {
          toast.success(`E-Mail an ${assignee?.full_name} gesendet`);
        }
      } catch {
        // E-Mail fehlgeschlagen, Schicht wurde trotzdem erstellt
      }
    }

    setShowShiftForm(false);
    setShiftForm({ title: "", start_time: "08:00", end_time: "17:00", profile_id: "" });
    loadShifts();
  }

  async function deleteShift(id: string) {
    await supabase.from("calendar_events").delete().eq("id", id);
    toast.success("Schicht gelöscht");
    loadShifts();
  }

  const admins = profiles.filter((p) => p.role === "admin");
  const techniker = profiles.filter((p) => p.role === "techniker");

  const existingNames = profiles.map((p) => p.full_name.toLowerCase());
  const availablePresets = TEAM_PRESETS.filter(
    (preset) => !existingNames.some((n) => n.includes(preset.name.toLowerCase()))
  );

  // Gruppe Zeiteinträge nach Person
  const activeNow = timeEntries.filter((e) => !e.clock_out);
  const completed = timeEntries.filter((e) => e.clock_out);

  function exportCSV() {
    const rows = [["Name", "Datum", "Von", "Bis", "Pause (Min)", "Arbeitszeit", "Kategorie", "Auftrag"]];
    const catLabels: Record<string, string> = { buero: "Büro", planung: "Planung", einsatz: "Einsatz", transport: "Transport", meeting: "Meeting" };
    for (const e of completed) {
      const name = e.profile?.full_name || "Unbekannt";
      const date = formatDate(e.clock_in);
      const von = formatTime(e.clock_in);
      const bis = formatTime(e.clock_out!);
      const duration = formatDuration(e.clock_in, e.clock_out!, e.break_minutes);
      const category = catLabels[(e as any).category] || "";
      const job = e.job?.title || "";
      rows.push([name, date, von, bis, String(e.break_minutes), duration, category, job]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Zeiterfassung_${timeFilter}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportiert");
  }

  async function exportTable(table: string, label: string) {
    const { data, error } = await supabase.from(table).select("*");
    if (error || !data || data.length === 0) {
      toast.error(`Keine Daten in ${label}`);
      return;
    }
    const headers = Object.keys(data[0]);
    const rows = [headers.join(";")];
    for (const row of data) {
      rows.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(";"));
    }
    const csv = "\uFEFF" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${label} exportiert`);
  }

  async function exportAll() {
    const tables = [
      { table: "customers", label: "Kunden" },
      { table: "jobs", label: "Auftraege" },
      { table: "time_entries", label: "Zeiterfassung" },
      { table: "service_reports", label: "Rapporte" },
      { table: "locations", label: "Standorte" },
      { table: "rental_requests", label: "Vermietungen" },
      { table: "profiles", label: "Team" },
    ];
    for (const t of tables) {
      await exportTable(t.table, t.label);
    }
    toast.success("Alle Daten exportiert!");
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "team", label: "Team", icon: <Users className="h-4 w-4" /> },
    { key: "zeiten", label: "Stempelzeiten", icon: <Clock className="h-4 w-4" /> },
    { key: "schichten", label: "Schichtplanung", icon: <Calendar className="h-4 w-4" /> },
    { key: "backup", label: "Backup", icon: <Download className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team & Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Team verwalten, Zeiten einsehen und Schichten planen
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== TAB: TEAM ===== */}
      {tab === "team" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{profiles.length} Mitglieder</p>
            <Button
              onClick={() => setShowAdd(!showAdd)}
              className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
            >
              {showAdd ? <X className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              {showAdd ? "Abbrechen" : "Hinzufügen"}
            </Button>
          </div>

          {/* Quick Add */}
          {!showAdd && availablePresets.length > 0 && (
            <Card className="bg-blue-50/50 border-blue-100">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-blue-900 mb-3">Schnell hinzufügen</p>
                <div className="flex flex-wrap gap-2">
                  {availablePresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => prefillUser(preset)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-sm font-medium text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {preset.name}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">
                        Admin
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add Form */}
          {showAdd && (
            <Card className="border-red-100 shadow-sm">
              <CardContent className="p-6">
                <form onSubmit={addUser} className="space-y-5">
                  <h3 className="font-semibold text-base">Neuen Benutzer erstellen</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Name *</label>
                      <Input placeholder="Vor- und Nachname" value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" required />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">E-Mail *</label>
                      <Input type="email" placeholder="name@eventline-basel.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" required />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Passwort *</label>
                      <Input type="password" placeholder="Min. 6 Zeichen" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" required />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Rolle</label>
                      <select value={newRole} onChange={(e) => setNewRole(e.target.value as "admin" | "techniker")} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300">
                        <option value="techniker">Service-Techniker</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" onClick={() => setShowAdd(false)} className="border-gray-200">Abbrechen</Button>
                    <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving ? "Erstellen..." : "Benutzer erstellen"}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Team List */}
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <div className="space-y-6">
              {admins.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="h-3.5 w-3.5 text-red-500" />
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Administratoren ({admins.length})</h2>
                  </div>
                  <div className="space-y-2">
                    {admins.map((p) => <TeamMemberCard key={p.id} profile={p} onToggleRole={toggleRole} />)}
                  </div>
                </div>
              )}
              {techniker.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service-Techniker ({techniker.length})</h2>
                  </div>
                  <div className="space-y-2">
                    {techniker.map((p) => <TeamMemberCard key={p.id} profile={p} onToggleRole={toggleRole} />)}
                  </div>
                </div>
              )}
              {profiles.length === 0 && (
                <Card className="bg-white">
                  <CardContent className="p-8 text-center">
                    <Users className="h-10 w-10 text-gray-300 mx-auto" />
                    <p className="mt-3 text-sm text-muted-foreground">Noch keine Teammitglieder.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: STEMPELZEITEN ===== */}
      {tab === "zeiten" && (
        <div className="space-y-6">
          {/* Filter & Export */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
            {[
              { key: "heute", label: "Heute" },
              { key: "woche", label: "7 Tage" },
              { key: "monat", label: "30 Tage" },
              { key: "alle", label: "Alle" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setTimeFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  timeFilter === f.key
                    ? "bg-red-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
            </div>
            {completed.length > 0 && (
              <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium transition-colors">
                <Download className="h-4 w-4" />CSV Export
              </button>
            )}
          </div>

          {/* Aktuell eingestempelt */}
          {activeNow.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Jetzt eingestempelt ({activeNow.length})
                </h2>
              </div>
              <div className="space-y-2">
                {activeNow.map((entry) => (
                  <Card key={entry.id} className="bg-green-50 border-green-200">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center text-white text-sm font-bold">
                          {entry.profile?.full_name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{entry.profile?.full_name || "Unbekannt"}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-green-700 flex items-center gap-1">
                              <Play className="h-3 w-3" />
                              Seit {formatTime(entry.clock_in)}
                            </span>
                            {entry.job && (
                              <span className="text-xs text-green-600">
                                — {entry.job.title}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <LiveTimer clockIn={entry.clock_in} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Abgeschlossene Einträge */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
              {activeNow.length > 0 ? "Abgeschlossene Einträge" : "Stempelzeiten"} ({completed.length})
            </h2>
            {timeLoading ? (
              <LoadingSkeleton />
            ) : completed.length === 0 ? (
              <Card className="bg-white border-dashed">
                <CardContent className="py-10 text-center">
                  <Clock className="h-8 w-8 text-gray-300 mx-auto" />
                  <p className="mt-2 text-sm text-muted-foreground">Keine Einträge im gewählten Zeitraum.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {completed.map((entry) => (
                  <Card key={entry.id} className="bg-white border-gray-100">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-sm font-bold">
                          {entry.profile?.full_name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{entry.profile?.full_name || "Unbekannt"}</h3>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(entry.clock_in)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {formatTime(entry.clock_in)} – {formatTime(entry.clock_out!)}
                            </span>
                            {entry.job && (
                              <span className="text-xs text-muted-foreground">
                                — {entry.job.title}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold">
                        {formatDuration(entry.clock_in, entry.clock_out!, entry.break_minutes)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== TAB: EINSATZÜBERSICHT ===== */}
      {tab === "schichten" && (
        <TeamOverview profiles={profiles} supabase={supabase} />
      )}

      {/* ===== TAB: BACKUP ===== */}
      {tab === "backup" && (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">Exportiere alle Daten als CSV-Dateien für dein Backup oder die Buchhaltung.</p>
          </div>

          {/* Alle exportieren */}
          <Card className="bg-white border-gray-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Komplett-Backup</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Alle Tabellen als separate CSV-Dateien herunterladen</p>
                </div>
                <Button onClick={exportAll} className="bg-red-600 hover:bg-red-700 text-white">
                  <Download className="h-4 w-4 mr-2" />Alles exportieren
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Einzelne Tabellen */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Einzelne Bereiche exportieren</h2>
            <div className="space-y-2">
              {[
                { table: "customers", label: "Kunden", desc: "Alle Kundendaten mit Kontaktinfos" },
                { table: "jobs", label: "Aufträge", desc: "Alle Aufträge mit Status und Details" },
                { table: "time_entries", label: "Zeiterfassung", desc: "Alle Stempelzeiten aller Mitarbeiter" },
                { table: "service_reports", label: "Rapporte", desc: "Alle Einsatzrapporte" },
                { table: "locations", label: "Standorte", desc: "Alle Standorte und Adressen" },
                { table: "rental_requests", label: "Vermietungen", desc: "Alle Vermietungsanfragen" },
                { table: "profiles", label: "Team", desc: "Alle Teammitglieder" },
                { table: "job_appointments", label: "Termine", desc: "Alle Auftrags-Termine" },
                { table: "maintenance_tasks", label: "Instandhaltung", desc: "Alle Instandhaltungsarbeiten" },
                { table: "calendar_events", label: "Schichten", desc: "Alle Kalendereinträge und Schichten" },
              ].map((item) => (
                <Card key={item.table} className="bg-white border-gray-100">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{item.label}</h3>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => exportTable(item.table, item.label)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />CSV
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Helper Components ===

function LiveTimer({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    function update() {
      const diff = Date.now() - new Date(clockIn).getTime();
      const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
      setElapsed(`${h}:${m}`);
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [clockIn]);

  return <span className="text-sm font-mono font-semibold text-green-700">{elapsed}</span>;
}

function TeamMemberCard({ profile, onToggleRole }: { profile: Profile; onToggleRole: (p: Profile) => void }) {
  const isAdmin = profile.role === "admin";
  return (
    <Card className="bg-white border-gray-100 hover:border-gray-200 transition-colors">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm ${isAdmin ? "bg-gradient-to-br from-red-500 to-red-700" : "bg-gradient-to-br from-gray-400 to-gray-600"}`}>
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{profile.full_name}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${isAdmin ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                {isAdmin ? <Shield className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                {USER_ROLES[profile.role]}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />{profile.email}
              </span>
              {profile.phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />{profile.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onToggleRole(profile)} className="text-xs border-gray-200 hover:border-gray-300">
          {isAdmin ? "Zu Techniker" : "Zu Admin"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TeamOverview({ profiles, supabase }: { profiles: Profile[]; supabase: any }) {
  const [data, setData] = useState<Record<string, { jobs: any[]; appointments: any[]; hours: number }>>({});
  const [filter, setFilter] = useState("monat");
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadOverview(); }, [filter]);

  async function loadOverview() {
    setLoading(true);
    const now = new Date();
    let startDate: string;
    let endDate: string;

    if (filter === "woche") {
      const dayOfWeek = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      startDate = monday.toISOString().split("T")[0];
      endDate = sunday.toISOString().split("T")[0];
    } else {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    }

    const [jobsRes, apptsRes, timeRes] = await Promise.all([
      supabase.from("job_assignments").select("profile_id, job:jobs(id, title, status, start_date, end_date, customer:customers(name))"),
      supabase.from("job_appointments").select("assigned_to, title, start_time, end_time, is_done, job_id, job:jobs(title)").gte("start_time", startDate + "T00:00:00").lte("start_time", endDate + "T23:59:59"),
      supabase.from("time_entries").select("profile_id, clock_in, clock_out, break_minutes").gte("clock_in", startDate + "T00:00:00").lte("clock_in", endDate + "T23:59:59").not("clock_out", "is", null),
    ]);

    // Auch Aufträge wo die Person Projektleiter ist
    const { data: leadJobs } = await supabase.from("jobs").select("id, title, status, start_date, end_date, project_lead_id, customer:customers(name)").not("project_lead_id", "is", null);

    console.log("Team data:", { jobsRes: jobsRes.data?.length, jobsError: jobsRes.error, apptsRes: apptsRes.data?.length, apptsError: apptsRes.error, leadJobs: leadJobs?.length, startDate, endDate });

    const result: Record<string, { jobs: any[]; appointments: any[]; hours: number }> = {};

    for (const p of profiles) {
      const personJobs: any[] = [];
      const seenJobIds = new Set<string>();

      // Jobs als Techniker
      if (jobsRes.data) {
        for (const a of jobsRes.data as any[]) {
          if (a.profile_id === p.id && a.job && !seenJobIds.has(a.job.id)) {
            personJobs.push(a.job);
            seenJobIds.add(a.job.id);
          }
        }
      }

      // Jobs als Projektleiter
      if (leadJobs) {
        for (const j of leadJobs as any[]) {
          if (j.project_lead_id === p.id && !seenJobIds.has(j.id)) {
            personJobs.push(j);
            seenJobIds.add(j.id);
          }
        }
      }

      // Termine
      const personAppts = (apptsRes.data as any[] || []).filter((a: any) => a.assigned_to === p.id);

      // Stunden
      let totalMin = 0;
      if (timeRes.data) {
        for (const t of timeRes.data as any[]) {
          if (t.profile_id === p.id && t.clock_out) {
            totalMin += (new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 60000 - (t.break_minutes || 0);
          }
        }
      }

      result[p.id] = { jobs: personJobs, appointments: personAppts, hours: Math.round(totalMin / 60 * 10) / 10 };
    }

    setData(result);
    setLoading(false);
  }

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "woche", label: "Diese Woche" },
          { key: "monat", label: "Dieser Monat" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Pro Person */}
      {profiles.map((p) => {
        const d = data[p.id] || { jobs: [], appointments: [], hours: 0 };
        return (
          <Card key={p.id} className="bg-white border-gray-100">
            <CardContent className="p-5">
              {/* Person Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold">
                    {p.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold">{p.full_name}</h3>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{d.hours}h</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Gestempelt</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-2.5 rounded-lg bg-blue-50 text-center">
                  <p className="text-lg font-bold text-blue-700">{d.jobs.length}</p>
                  <p className="text-[10px] text-blue-600 font-medium">Aufträge</p>
                </div>
                <div className="p-2.5 rounded-lg bg-green-50 text-center">
                  <p className="text-lg font-bold text-green-700">{d.appointments.length}</p>
                  <p className="text-[10px] text-green-600 font-medium">Termine</p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-50 text-center">
                  <p className="text-lg font-bold text-amber-700">{d.hours}</p>
                  <p className="text-[10px] text-amber-600 font-medium">Stunden</p>
                </div>
              </div>

              {/* Aufträge */}
              {d.jobs.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Aufträge</p>
                  <div className="space-y-1">
                    {d.jobs.map((j: any) => (
                      <div key={j.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-sm">
                        <span className="font-medium">{j.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${j.status === "abgeschlossen" ? "bg-green-100 text-green-700" : j.status === "in_arbeit" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                          {j.status === "offen" ? "Offen" : j.status === "geplant" ? "Geplant" : j.status === "in_arbeit" ? "In Arbeit" : j.status === "abgeschlossen" ? "Erledigt" : j.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Termine */}
              {d.appointments.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Termine</p>
                  <div className="space-y-1">
                    {d.appointments.map((a: any, i: number) => (
                      <Link key={i} href={a.job_id ? `/auftraege/${a.job_id}` : "#"}>
                        <div className={`flex items-center justify-between p-2 rounded-lg text-sm cursor-pointer hover:shadow-sm transition-all ${a.is_done ? "bg-green-50" : "bg-gray-50"}`}>
                          <div>
                            <span className={`font-medium ${a.is_done ? "line-through text-muted-foreground" : ""}`}>{a.title}</span>
                            {a.job?.title && <span className="text-xs text-blue-600 ml-2">→ {a.job.title}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.start_time).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })} {new Date(a.start_time).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                            {a.end_time ? ` – ${new Date(a.end_time).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}` : ""}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {d.jobs.length === 0 && d.appointments.length === 0 && d.hours === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Keine Einsätze in diesem Zeitraum</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse bg-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gray-200" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// === Helper Functions ===

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatDuration(clockIn: string, clockOut: string, breakMin: number) {
  const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime() - breakMin * 60000;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}
