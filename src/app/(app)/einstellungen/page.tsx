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
import { toast } from "sonner";

type Tab = "team" | "zeiten" | "schichten";

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
  const [tab, setTab] = useState<Tab>(urlTab && ["team", "zeiten", "schichten"].includes(urlTab) ? urlTab : "team");
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
    if (urlTab && ["team", "zeiten", "schichten"].includes(urlTab)) {
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
  }, [tab, timeFilter, shiftDate]);

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
    const dayStart = `${shiftDate}T00:00:00`;
    const dayEnd = `${shiftDate}T23:59:59`;

    const { data } = await supabase
      .from("calendar_events")
      .select("id, title, start_time, end_time, profile_id, color, profile:profiles(full_name)")
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
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
      start_time: `${shiftDate}T${shiftForm.start_time}:00`,
      end_time: `${shiftDate}T${shiftForm.end_time}:00`,
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
    const rows = [["Name", "Datum", "Von", "Bis", "Pause (Min)", "Arbeitszeit", "Auftrag"]];
    for (const e of completed) {
      const name = e.profile?.full_name || "Unbekannt";
      const date = formatDate(e.clock_in);
      const von = formatTime(e.clock_in);
      const bis = formatTime(e.clock_out!);
      const duration = formatDuration(e.clock_in, e.clock_out!, e.break_minutes);
      const job = e.job?.title || "";
      rows.push([name, date, von, bis, String(e.break_minutes), duration, job]);
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "team", label: "Team", icon: <Users className="h-4 w-4" /> },
    { key: "zeiten", label: "Stempelzeiten", icon: <Clock className="h-4 w-4" /> },
    { key: "schichten", label: "Schichtplanung", icon: <Calendar className="h-4 w-4" /> },
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

      {/* ===== TAB: SCHICHTPLANUNG ===== */}
      {tab === "schichten" && (
        <div className="space-y-6">
          {/* Date & Add */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="bg-white border-gray-200 w-44"
              />
              <span className="text-sm text-muted-foreground">
                {new Date(shiftDate + "T12:00:00").toLocaleDateString("de-CH", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </span>
            </div>
            <Button
              onClick={() => setShowShiftForm(!showShiftForm)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {showShiftForm ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {showShiftForm ? "Abbrechen" : "Schicht erstellen"}
            </Button>
          </div>

          {/* Shift Form */}
          {showShiftForm && (
            <Card className="border-red-100 shadow-sm">
              <CardContent className="p-5">
                <form onSubmit={createShift} className="space-y-4">
                  <h3 className="font-semibold text-sm">Neue Schicht für {new Date(shiftDate + "T12:00:00").toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Bezeichnung</label>
                      <Input
                        placeholder="z.B. Frühschicht, Aufbau, Event"
                        value={shiftForm.title}
                        onChange={(e) => setShiftForm((f) => ({ ...f, title: e.target.value }))}
                        className="mt-1.5 bg-gray-50 border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Mitarbeiter</label>
                      <select
                        value={shiftForm.profile_id}
                        onChange={(e) => setShiftForm((f) => ({ ...f, profile_id: e.target.value }))}
                        className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300"
                      >
                        <option value="">Mitarbeiter wählen...</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.full_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Von</label>
                      <Input
                        type="time"
                        value={shiftForm.start_time}
                        onChange={(e) => setShiftForm((f) => ({ ...f, start_time: e.target.value }))}
                        className="mt-1.5 bg-gray-50 border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Bis</label>
                      <Input
                        type="time"
                        value={shiftForm.end_time}
                        onChange={(e) => setShiftForm((f) => ({ ...f, end_time: e.target.value }))}
                        className="mt-1.5 bg-gray-50 border-gray-200"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" onClick={() => setShowShiftForm(false)} className="border-gray-200">Abbrechen</Button>
                    <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">Schicht erstellen</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Shift List */}
          {shiftLoading ? (
            <LoadingSkeleton />
          ) : shifts.length === 0 ? (
            <Card className="bg-white border-dashed">
              <CardContent className="py-10 text-center">
                <Calendar className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="mt-2 text-sm text-muted-foreground">Keine Schichten für diesen Tag.</p>
                <Button
                  onClick={() => setShowShiftForm(true)}
                  variant="outline"
                  className="mt-3 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" /> Schicht erstellen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {shifts.map((shift) => (
                <Card key={shift.id} className="bg-white border-gray-100 hover:border-gray-200 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
                        {shift.profile?.full_name?.charAt(0).toUpperCase() || <Calendar className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{shift.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                          </span>
                          {shift.profile?.full_name && (
                            <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {shift.profile.full_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteShift(shift.id)}
                      className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Schicht löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Team-Übersicht für den Tag */}
          {profiles.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Tagesübersicht Team
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {profiles.map((p) => {
                  const personShifts = shifts.filter((s) => s.profile_id === p.id);
                  return (
                    <Card key={p.id} className={`border-gray-100 ${personShifts.length > 0 ? "bg-white" : "bg-gray-50"}`}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${personShifts.length > 0 ? "bg-red-500" : "bg-gray-300"}`}>
                          {p.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.full_name}</p>
                          {personShifts.length > 0 ? (
                            <p className="text-[11px] text-red-600">
                              {personShifts.map((s) => `${formatTime(s.start_time)}–${formatTime(s.end_time)}`).join(", ")}
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-400">Keine Schicht</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
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
