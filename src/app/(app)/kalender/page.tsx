"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Job, RentalRequest, JobAppointment, Profile } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  ClipboardList,
  Inbox,
  Calendar as CalIcon,
  User,
  CalendarClock,
  Plus,
  X,
  Trash2,
  Link as LinkIcon,
  Copy,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { JOB_STATUS, RENTAL_STATUS } from "@/lib/constants";
import { toast } from "sonner";
import Link from "next/link";

interface CalendarItem {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  time: string | null;
  endTime?: string | null;
  type: "auftrag" | "vermietung" | "termin";
  color: string;
  bgColor: string;
  dotColor: string;
  link?: string;
  meta?: string;
}

type View = "monat" | "woche";

export default function KalenderPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [view, setView] = useState<View>("monat");
  const [showForm, setShowForm] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteCode, setDeleteCode] = useState("");
  const [showSync, setShowSync] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    title: "", date: new Date().toISOString().split("T")[0],
    time: "08:00", end_time: "17:00", assigned_to: [] as string[], job_id: "",
  });
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [jobsRes, rentalsRes, apptsRes, profRes, activeJobsRes] = await Promise.all([
        supabase.from("jobs").select("*, job_number, customer:customers(name), location:locations(name)").not("start_date", "is", null).neq("is_deleted", true),
        supabase.from("rental_requests").select("*, customer:customers(name), location:locations(name)").not("event_date", "is", null),
        supabase.from("job_appointments").select("*, assignee:profiles!assigned_to(full_name), job:jobs(title, id)").not("start_time", "is", null),
        supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
        supabase.from("jobs").select("id, title, job_number").eq("status", "offen").neq("is_deleted", true).order("created_at", { ascending: false }),
      ]);
      if (profRes.data) setProfiles(profRes.data as Profile[]);
      if (activeJobsRes.data) setJobs(activeJobsRes.data as unknown as Job[]);

      const calItems: CalendarItem[] = [];

      // Aufträge
      if (jobsRes.data) {
        for (const j of jobsRes.data as unknown as Job[]) {
          if (!j.start_date) continue;
          const d = new Date(j.start_date);
          const endD = j.end_date ? new Date(j.end_date) : undefined;
          const loc = (j.location as unknown as { name: string })?.name;
          const cust = (j.customer as unknown as { name: string })?.name;
          calItems.push({
            id: j.id, title: `INT-${(j as any).job_number} ${j.title}`, date: d, endDate: endD,
            time: null,
            endTime: null,
            type: "auftrag", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200", dotColor: "bg-blue-500",
            link: `/auftraege/${j.id}`,
            meta: [cust, loc].filter(Boolean).join(" · "),
          });
        }
      }

      // Vermietungen
      if (rentalsRes.data) {
        for (const r of rentalsRes.data as unknown as RentalRequest[]) {
          if (!r.event_date) continue;
          const d = new Date(r.event_date);
          const endD = r.event_end_date ? new Date(r.event_end_date) : undefined;
          const cust = (r.customer as unknown as { name: string })?.name;
          const loc = (r.location as unknown as { name: string })?.name;
          calItems.push({
            id: r.id, title: `Vermietung: ${cust || "Unbekannt"}`, date: d, endDate: endD,
            time: null,
            type: "vermietung", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200", dotColor: "bg-amber-500",
            link: `/anfragen/${r.id}`,
            meta: [loc, r.guest_count ? `${r.guest_count} Pers.` : null].filter(Boolean).join(" · "),
          });
        }
      }

      // Termine (= Schichten/Einsätze)
      if (apptsRes.data) {
        for (const a of apptsRes.data as unknown as (JobAppointment & { job: { title: string; id: string } })[]) {
          const d = new Date(a.start_time);
          const end = a.end_time ? new Date(a.end_time) : undefined;
          const assignee = (a as unknown as { assignee: { full_name: string } | null }).assignee;
          calItems.push({
            id: a.id, title: a.title, date: d,
            time: d.getHours() > 0 ? formatTime(d) : null,
            endTime: end && end.getHours() > 0 ? formatTime(end) : null,
            type: "termin", color: "text-green-700", bgColor: "bg-green-50 border-green-200", dotColor: "bg-green-500",
            link: a.job_id ? `/auftraege/${a.job_id}` : undefined,
            meta: [assignee?.full_name, a.job?.title].filter(Boolean).join(" · "),
          });
        }
      }

      setItems(calItems);
    }
    load();
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString("de-CH", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;

  const days: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let i = 1; i <= lastDay.getDate(); i++) days.push(i);
  // Auffüllen bis 7er-Grid voll
  while (days.length % 7 !== 0) days.push(null);

  function getItemsForDay(day: number) {
    const dayStart = new Date(year, month, day, 0, 0, 0);
    return items.filter((item) => {
      const itemStart = new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate());
      const itemEnd = item.endDate
        ? new Date(item.endDate.getFullYear(), item.endDate.getMonth(), item.endDate.getDate())
        : itemStart;
      return dayStart >= itemStart && dayStart <= itemEnd;
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null); }
  function goToday() {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(now.getDate());
  }

  const isToday = (day: number) => {
    const now = new Date();
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  const isWeekend = (day: number) => {
    const d = new Date(year, month, day);
    return d.getDay() === 0 || d.getDay() === 6;
  };

  async function createAppointment(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    const tzOffset = -new Date().getTimezoneOffset();
    const tzSign = tzOffset >= 0 ? "+" : "-";
    const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
    const tzM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
    const tz = `${tzSign}${tzH}:${tzM}`;

    // Wenn niemand ausgewählt → mir selbst zuweisen
    const assignees = form.assigned_to.length > 0 ? form.assigned_to : [user?.id || ""];

    // Für jede Person einen Termin erstellen
    const rows = assignees.map((personId) => ({
      job_id: form.job_id || null,
      title: form.title,
      start_time: `${form.date}T${form.time}:00${tz}`,
      end_time: `${form.date}T${form.end_time}:00${tz}`,
      assigned_to: personId,
    }));
    await supabase.from("job_appointments").insert(rows);

    // E-Mail an zugewiesene Personen (nicht an mich selbst)
    const { data: creator } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
    const selectedJob = jobs.find((j) => j.id === form.job_id);
    for (const personId of assignees) {
      if (personId && personId !== user?.id) {
        await fetch("/api/appointments/assign-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedTo: personId,
            title: form.title,
            date: form.date,
            time: form.time,
            endTime: form.end_time,
            jobTitle: (selectedJob as any)?.title || null,
            creatorName: creator?.full_name || "Unbekannt",
          }),
        });
      }
    }

    setForm({ title: "", date: new Date().toISOString().split("T")[0], time: "08:00", end_time: "17:00", assigned_to: [], job_id: "" });
    setShowForm(false);
    toast.success(`Termin für ${assignees.length} Person${assignees.length > 1 ? "en" : ""} erstellt`);
    window.location.reload();
  }

  const typeConfig = {
    auftrag: { icon: <ClipboardList className="h-3.5 w-3.5" />, label: "Auftrag" },
    vermietung: { icon: <Inbox className="h-3.5 w-3.5" />, label: "Vermietung" },
    termin: { icon: <CalIcon className="h-3.5 w-3.5" />, label: "Termin" },
  };

  const selectedDayItems = selectedDay ? getItemsForDay(selectedDay) : [];

  // Wochenansicht
  const getWeekDays = () => {
    const today = new Date(currentDate);
    const dayOfWeek = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek);
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDays.push(d);
    }
    return weekDays;
  };

  const weekDays = getWeekDays();

  // Statistik
  const thisMonthItems = items.filter((i) => i.date.getMonth() === month && i.date.getFullYear() === year);
  const stats = {
    auftraege: thisMonthItems.filter((i) => i.type === "auftrag").length,
    vermietungen: thisMonthItems.filter((i) => i.type === "vermietung").length,
    termine: thisMonthItems.filter((i) => i.type === "termin").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-foreground mt-1">Aufträge, Vermietungen & Termine</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowSync(true)} variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50">
            <LinkIcon className="h-4 w-4 mr-1" />Google Kalender
          </Button>
          <Button onClick={() => setShowForm(!showForm)} className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
            {showForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            {showForm ? "Abbrechen" : "Termin"}
          </Button>
          {/* View Toggle */}
          <div className="flex p-0.5 bg-gray-100 rounded-lg">
            <button
              onClick={() => setView("monat")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === "monat" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Monat
            </button>
            <button
              onClick={() => setView("woche")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === "woche" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Woche
            </button>
          </div>
        </div>
      </div>

      {/* Termin erstellen */}
      {showForm && (
        <Card className="bg-white border-red-100">
          <CardContent className="p-5">
            <form onSubmit={createAppointment} className="space-y-4">
              <Input placeholder="Titel (z.B. Büro, Übergabe, Meeting) *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-gray-50" required />
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium">Datum *</label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 bg-gray-50" required /></div>
                <div><label className="text-xs font-medium">Von *</label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1 bg-gray-50" required /></div>
                <div><label className="text-xs font-medium">Bis *</label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="mt-1 bg-gray-50" required /></div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Zuweisen an {form.assigned_to.length > 0 && <span className="text-red-500">({form.assigned_to.length})</span>}</label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {profiles.map((p) => {
                      const selected = form.assigned_to.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setForm({ ...form, assigned_to: selected ? form.assigned_to.filter((id) => id !== p.id) : [...form.assigned_to, p.id] })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${selected ? "bg-red-600 text-white border-red-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                            {p.full_name.charAt(0)}
                          </div>
                          {p.full_name.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                  {form.assigned_to.length === 0 && <p className="text-[11px] text-muted-foreground mt-1">Keine Auswahl = mir selbst zuweisen</p>}
                </div>
                <div>
                  <label className="text-xs font-medium">Auftrag (optional)</label>
                  <select value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                    <option value="">Kein Auftrag</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>INT-{(j as any).job_number} – {j.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">Termin erstellen</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Monats-Statistik */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Aufträge", count: stats.auftraege, dot: "bg-blue-500" },
          { label: "Vermietungen", count: stats.vermietungen, dot: "bg-amber-500" },
          { label: "Termine", count: stats.termine, dot: "bg-green-500" },
        ].map((s) => (
          <Card key={s.label} className="bg-white border-gray-100">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${s.dot}`} />
              <div>
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Kalender */}
        <Card className="bg-white">
          <CardContent className="p-5">
            {/* Navigation */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold capitalize">{monthName}</h2>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={prevMonth} className="h-8 w-8 p-0 border-gray-200">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToday} className="h-8 px-3 text-xs border-gray-200">
                  Heute
                </Button>
                <Button variant="outline" size="sm" onClick={nextMonth} className="h-8 w-8 p-0 border-gray-200">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {view === "monat" ? (
              <>
                {/* Wochentage */}
                <div className="grid grid-cols-7 mb-1">
                  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d, i) => (
                    <div key={d} className={`text-center text-[11px] font-semibold py-2 ${i >= 5 ? "text-gray-300 dark:text-gray-600" : "text-gray-400 dark:text-gray-400"}`}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Tage Grid */}
                <div className="grid grid-cols-7 gap-px bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700">
                  {days.map((day, i) => {
                    const dayItems = day ? getItemsForDay(day) : [];
                    const isSelected = day === selectedDay;
                    const hasItems = dayItems.length > 0;
                    return (
                      <div
                        key={i}
                        onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                        className={`min-h-[80px] p-1.5 bg-white dark:bg-gray-900 transition-all cursor-pointer ${
                          !day ? "bg-gray-50/50 dark:bg-gray-900/50" :
                          isSelected ? "bg-red-50 dark:bg-red-950 ring-2 ring-red-400 ring-inset z-10" :
                          isWeekend(day) ? "bg-gray-50/30 dark:bg-gray-900/30 hover:bg-gray-50 dark:hover:bg-gray-800" :
                          "hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        {day && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className={`inline-flex items-center justify-center w-6 h-6 text-[11px] font-semibold rounded-full ${
                                isToday(day) ? "bg-red-500 text-white" :
                                isWeekend(day) ? "text-gray-300 dark:text-gray-500" :
                                "text-gray-600 dark:text-gray-300"
                              }`}>
                                {day}
                              </span>
                              {hasItems && !isSelected && (
                                <div className="flex gap-0.5">
                                  {[...new Set(dayItems.map((i) => i.dotColor))].slice(0, 3).map((c, idx) => (
                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full ${c}`} />
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="mt-0.5 space-y-0.5">
                              {dayItems.map((item) => {
                                const dayStart = new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate()).getTime();
                                const dayEnd = item.endDate ? new Date(item.endDate.getFullYear(), item.endDate.getMonth(), item.endDate.getDate()).getTime() : dayStart;
                                const thisDay = new Date(year, month, day).getTime();
                                const isMultiDay = dayEnd > dayStart;
                                const isFirstDay = thisDay === dayStart;
                                const isLastDay = thisDay === dayEnd;
                                const dayOfWeek = new Date(year, month, day).getDay();
                                const isMonday = dayOfWeek === 1;
                                const isSunday = dayOfWeek === 0;
                                const showLabel = isFirstDay || isMonday;
                                // Bei mehrtägigen Events: durchgezogener Strich über Tage UND über Wochenenden
                                let roundClass = "rounded";
                                let marginClass = "";
                                if (isMultiDay) {
                                  const extendLeft = !isFirstDay;
                                  const extendRight = !isLastDay;
                                  // Linken/rechten Rand erweitern um den gap-px zwischen Zellen zu überlappen
                                  const left = extendLeft ? (isMonday ? "-ml-1.5" : "-ml-[7px]") : "";
                                  const right = extendRight ? (isSunday ? "-mr-1.5" : "-mr-[7px]") : "";
                                  marginClass = `${left} ${right}`;
                                  if (isFirstDay && !isLastDay) roundClass = "rounded-l";
                                  else if (isLastDay && !isFirstDay) roundClass = "rounded-r";
                                  else if (!isFirstDay && !isLastDay) roundClass = "";
                                }
                                return (
                                  <div key={item.id} className={`px-1.5 py-0.5 text-[9px] font-semibold border ${item.bgColor} ${item.color} truncate leading-tight ${roundClass} ${marginClass}`}>
                                    {showLabel ? (
                                      <>
                                        {item.time && <span className="opacity-70">{item.time} </span>}
                                        {item.title}
                                      </>
                                    ) : (
                                      <span className="opacity-0">.</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Wochenansicht */
              <div className="space-y-1">
                {weekDays.map((wd) => {
                  const dayNum = wd.getDate();
                  const isWdToday = wd.toDateString() === new Date().toDateString();
                  const wdMonth = wd.getMonth();
                  const wdYear = wd.getFullYear();
                  const wdItems = items.filter((item) => {
                    const itemDate = new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate());
                    const itemEnd = item.endDate ? new Date(item.endDate.getFullYear(), item.endDate.getMonth(), item.endDate.getDate()) : itemDate;
                    const thisDay = new Date(wdYear, wdMonth, dayNum);
                    return thisDay >= itemDate && thisDay <= itemEnd;
                  });

                  return (
                    <div key={wd.toISOString()} className={`flex gap-4 p-3 rounded-xl transition-colors ${isWdToday ? "bg-red-50 border border-red-200" : "hover:bg-gray-50"}`}>
                      <div className="text-center min-w-[48px]">
                        <div className="text-[10px] font-semibold text-gray-400 uppercase">
                          {wd.toLocaleDateString("de-CH", { weekday: "short" })}
                        </div>
                        <div className={`text-xl font-bold ${isWdToday ? "text-red-600" : "text-gray-800"}`}>
                          {dayNum}
                        </div>
                      </div>
                      <div className="flex-1 space-y-1.5 min-h-[40px]">
                        {wdItems.length === 0 ? (
                          <p className="text-xs text-gray-300 pt-2">Keine Einträge</p>
                        ) : (
                          wdItems.map((item) => (
                            <div key={item.id}>
                              {item.link ? (
                                <Link href={item.link}>
                                  <div className={`p-2.5 rounded-lg border ${item.bgColor} hover:shadow-sm transition-all cursor-pointer`}>
                                    <div className="flex items-center gap-2">
                                      <span className={item.color}>{typeConfig[item.type].icon}</span>
                                      <span className="text-sm font-medium flex-1 truncate">{item.title}</span>
                                      {item.time && (
                                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {item.time}{item.endTime ? ` – ${item.endTime}` : ""}
                                        </span>
                                      )}
                                    </div>
                                    {item.meta && <p className="text-[11px] text-gray-500 mt-0.5 ml-[22px]">{item.meta}</p>}
                                  </div>
                                </Link>
                              ) : (
                                <div className={`p-2.5 rounded-lg border ${item.bgColor}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={item.color}>{typeConfig[item.type].icon}</span>
                                    <span className="text-sm font-medium flex-1 truncate">{item.title}</span>
                                    {item.time && (
                                      <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {item.time}{item.endTime ? ` – ${item.endTime}` : ""}
                                      </span>
                                    )}
                                  </div>
                                  {item.meta && <p className="text-[11px] text-gray-500 mt-0.5 ml-[22px]">{item.meta}</p>}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Ausgewählter Tag */}
          {selectedDay && view === "monat" && (
            <Card className="bg-white">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${isToday(selectedDay) ? "bg-red-500 text-white" : "bg-gray-100 text-gray-700"}`}>
                    {selectedDay}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {new Date(year, month, selectedDay).toLocaleDateString("de-CH", { weekday: "long" })}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(year, month, selectedDay).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
                {selectedDayItems.length === 0 ? (
                  <div className="text-center py-6">
                    <CalIcon className="h-8 w-8 text-gray-200 mx-auto" />
                    <p className="text-sm text-gray-400 mt-2">Keine Einträge</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayItems.map((item) => {
                      const content = (
                        <div className={`p-3 rounded-xl border ${item.bgColor} ${item.link ? "hover:shadow-sm cursor-pointer" : ""} transition-all group/item`}>
                          <div className="flex items-center gap-2">
                            <span className={item.color}>{typeConfig[item.type].icon}</span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${item.color}`}>
                              {typeConfig[item.type].label}
                            </span>
                            {item.time && (
                              <span className="text-[11px] text-gray-500 ml-auto flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.time}{item.endTime ? ` – ${item.endTime}` : ""}
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-sm mt-1.5 text-gray-900">{item.title}</p>
                          {item.meta && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{item.meta}
                            </p>
                          )}
                          {item.type === "termin" && (
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(item.id); }} className="mt-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-[10px] font-medium border border-red-200 hover:bg-red-100 transition-colors">
                              <Trash2 className="h-3 w-3" />Löschen
                            </button>
                          )}
                        </div>
                      );
                      return item.link ? (
                        <Link key={item.id} href={item.link}>{content}</Link>
                      ) : (
                        <div key={item.id}>{content}</div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Legende */}
          <Card className="bg-white">
            <CardContent className="p-4">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Legende</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(typeConfig).map(([key, conf]) => (
                  <div key={key} className="flex items-center gap-2 text-xs text-gray-600">
                    <div className={`w-2.5 h-2.5 rounded-full ${key === "auftrag" ? "bg-blue-500" : key === "vermietung" ? "bg-amber-500" : key === "termin" ? "bg-green-500" : "bg-red-500"}`} />
                    {conf.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Google Kalender Sync Modal */}
      {showSync && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowSync(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold flex items-center gap-2"><LinkIcon className="h-4 w-4" />Google Kalender verbinden</h2>
                <button onClick={() => setShowSync(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">Mit diesem Link kannst du alle Aufträge, Vermietungen und Termine in deinen Google Kalender einbinden. Google aktualisiert ihn automatisch alle paar Stunden.</p>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kalender-Link</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      readOnly
                      value="https://eventline-fsm-usyk.vercel.app/api/calendar/feed?token=eventline-cal-5225"
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 font-mono"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText("https://eventline-fsm-usyk.vercel.app/api/calendar/feed?token=eventline-cal-5225");
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Kopiert!" : "Kopieren"}
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                  <h3 className="text-sm font-semibold mb-2">So einbinden in Google Kalender:</h3>
                  <ol className="text-xs text-gray-700 dark:text-gray-300 space-y-1.5 list-decimal list-inside">
                    <li>Öffne <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">calendar.google.com</a></li>
                    <li>Links bei "Weitere Kalender" auf das <strong>+</strong> klicken</li>
                    <li>Wähle <strong>"Per URL"</strong></li>
                    <li>Füge den oberen Link ein und klicke <strong>"Kalender hinzufügen"</strong></li>
                    <li>Fertig! Der Kalender erscheint in deiner Liste</li>
                  </ol>
                </div>

                <p className="text-[11px] text-muted-foreground">Hinweis: Dieser Link ist privat. Gib ihn nicht an Aussenstehende weiter.</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { setDeleteTarget(null); setDeleteCode(""); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Termin löschen</h2>
                <button onClick={() => { setDeleteTarget(null); setDeleteCode(""); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">Der Termin wird unwiderruflich gelöscht.</p>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bestätigungscode eingeben</label>
                  <Input value={deleteCode} onChange={(e) => setDeleteCode(e.target.value)} placeholder="Code eingeben..." className="mt-1.5 text-center text-lg tracking-widest font-mono" maxLength={4} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setDeleteTarget(null); setDeleteCode(""); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Abbrechen</button>
                  <button onClick={async () => {
                    if (deleteCode !== "5225") { toast.error("Falscher Code"); return; }
                    await supabase.from("job_appointments").delete().eq("id", deleteTarget);
                    setDeleteTarget(null); setDeleteCode("");
                    toast.success("Termin gelöscht");
                    window.location.reload();
                  }} disabled={deleteCode.length < 4} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-30">Endgültig löschen</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}
