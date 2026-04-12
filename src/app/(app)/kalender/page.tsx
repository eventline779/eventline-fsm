"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Job, RentalRequest, JobAppointment } from "@/types";
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
} from "lucide-react";
import { JOB_STATUS, RENTAL_STATUS } from "@/lib/constants";
import Link from "next/link";

interface CalendarItem {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  time: string | null;
  endTime?: string | null;
  type: "auftrag" | "vermietung" | "termin" | "schicht";
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
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [jobsRes, rentalsRes, apptsRes, shiftsRes] = await Promise.all([
        supabase.from("jobs").select("*, customer:customers(name), location:locations(name)").not("start_date", "is", null).neq("is_deleted", true),
        supabase.from("rental_requests").select("*, customer:customers(name), location:locations(name)").not("event_date", "is", null),
        supabase.from("job_appointments").select("*, assignee:profiles!assigned_to(full_name), job:jobs(title)").not("start_time", "is", null),
        supabase.from("calendar_events").select("*, profile:profiles(full_name)"),
      ]);

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
            id: j.id, title: j.title, date: d, endDate: endD,
            time: d.getHours() > 0 ? formatTime(d) : null,
            endTime: endD && endD.getHours() > 0 ? formatTime(endD) : null,
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
            time: d.getHours() > 0 ? formatTime(d) : null,
            type: "vermietung", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200", dotColor: "bg-amber-500",
            link: `/anfragen`,
            meta: [loc, r.guest_count ? `${r.guest_count} Pers.` : null].filter(Boolean).join(" · "),
          });
        }
      }

      // Termine
      if (apptsRes.data) {
        for (const a of apptsRes.data as unknown as (JobAppointment & { job: { title: string } })[]) {
          const d = new Date(a.start_time);
          const assignee = (a as unknown as { assignee: { full_name: string } | null }).assignee;
          calItems.push({
            id: a.id, title: a.title, date: d,
            time: d.getHours() > 0 ? formatTime(d) : null,
            type: "termin", color: "text-green-700", bgColor: "bg-green-50 border-green-200", dotColor: "bg-green-500",
            meta: assignee?.full_name || a.job?.title || undefined,
          });
        }
      }

      // Schichten
      if (shiftsRes.data) {
        for (const s of shiftsRes.data as any[]) {
          if (!s.start_time) continue;
          const d = new Date(s.start_time);
          const end = s.end_time ? new Date(s.end_time) : undefined;
          const person = s.profile?.full_name;
          calItems.push({
            id: s.id, title: s.title || "Schicht", date: d,
            time: formatTime(d),
            endTime: end ? formatTime(end) : null,
            type: "schicht", color: "text-red-700", bgColor: "bg-red-50 border-red-200", dotColor: "bg-red-500",
            link: "/einstellungen?tab=schichten",
            meta: person || undefined,
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

  const typeConfig = {
    auftrag: { icon: <ClipboardList className="h-3.5 w-3.5" />, label: "Auftrag" },
    vermietung: { icon: <Inbox className="h-3.5 w-3.5" />, label: "Vermietung" },
    termin: { icon: <CalIcon className="h-3.5 w-3.5" />, label: "Termin" },
    schicht: { icon: <CalendarClock className="h-3.5 w-3.5" />, label: "Schicht" },
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
    schichten: thisMonthItems.filter((i) => i.type === "schicht").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-foreground mt-1">Aufträge, Vermietungen, Termine & Schichten</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Monats-Statistik */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Aufträge", count: stats.auftraege, dot: "bg-blue-500" },
          { label: "Vermietungen", count: stats.vermietungen, dot: "bg-amber-500" },
          { label: "Termine", count: stats.termine, dot: "bg-green-500" },
          { label: "Schichten", count: stats.schichten, dot: "bg-red-500" },
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
                              {dayItems.slice(0, 2).map((item) => (
                                <div key={item.id} className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border ${item.bgColor} ${item.color} truncate leading-tight`}>
                                  {item.time && <span className="opacity-70">{item.time} </span>}
                                  {item.title}
                                </div>
                              ))}
                              {dayItems.length > 2 && (
                                <div className="text-[9px] text-gray-400 px-1 font-medium">+{dayItems.length - 2} mehr</div>
                              )}
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
                        <div className={`p-3 rounded-xl border ${item.bgColor} ${item.link ? "hover:shadow-sm cursor-pointer" : ""} transition-all`}>
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
                          <p className="font-medium text-sm mt-1.5">{item.title}</p>
                          {item.meta && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{item.meta}
                            </p>
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
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}
