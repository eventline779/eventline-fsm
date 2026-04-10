"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Job, RentalRequest, JobAppointment } from "@/types";
import { ChevronLeft, ChevronRight, MapPin, Clock, ClipboardList, Inbox, Calendar as CalIcon, User } from "lucide-react";
import { JOB_STATUS, RENTAL_STATUS } from "@/lib/constants";
import Link from "next/link";

interface CalendarItem {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  time: string | null;
  type: "auftrag" | "vermietung" | "termin";
  color: string;
  bgColor: string;
  link?: string;
  meta?: string;
}

export default function KalenderPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [jobsRes, rentalsRes, apptsRes] = await Promise.all([
        supabase.from("jobs").select("*, customer:customers(name), location:locations(name)").not("start_date", "is", null).neq("is_deleted", true),
        supabase.from("rental_requests").select("*, customer:customers(name), location:locations(name)").not("event_date", "is", null),
        supabase.from("job_appointments").select("*, assignee:profiles!assigned_to(full_name), job:jobs(title)").not("start_time", "is", null),
      ]);

      const calItems: CalendarItem[] = [];

      // Aufträge (inkl. mehrtägige)
      if (jobsRes.data) {
        for (const j of jobsRes.data as unknown as Job[]) {
          if (!j.start_date) continue;
          const d = new Date(j.start_date);
          const endD = j.end_date ? new Date(j.end_date) : undefined;
          const loc = (j.location as unknown as { name: string })?.name;
          calItems.push({
            id: j.id, title: j.title, date: d, endDate: endD,
            time: d.getHours() > 0 ? d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : null,
            type: "auftrag", color: "text-blue-700", bgColor: "bg-blue-50",
            link: `/auftraege/${j.id}`,
            meta: loc || undefined,
          });
        }
      }

      // Vermietungsanfragen
      if (rentalsRes.data) {
        for (const r of rentalsRes.data as unknown as RentalRequest[]) {
          if (!r.event_date) continue;
          const d = new Date(r.event_date);
          const endD = r.event_end_date ? new Date(r.event_end_date) : undefined;
          const cust = (r.customer as unknown as { name: string })?.name;
          const loc = (r.location as unknown as { name: string })?.name;
          calItems.push({
            id: r.id, title: `Anfrage: ${cust || "Unbekannt"}`, date: d, endDate: endD,
            time: d.getHours() > 0 ? d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : null,
            type: "vermietung", color: "text-amber-700", bgColor: "bg-amber-50",
            link: `/anfragen`,
            meta: loc || undefined,
          });
        }
      }

      // Termine aus Aufträgen
      if (apptsRes.data) {
        for (const a of apptsRes.data as unknown as (JobAppointment & { job: { title: string } })[]) {
          const d = new Date(a.start_time);
          const assignee = (a as unknown as { assignee: { full_name: string } | null }).assignee;
          calItems.push({
            id: a.id, title: a.title, date: d,
            time: d.getHours() > 0 ? d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : null,
            type: "termin", color: "text-green-700", bgColor: "bg-green-50",
            meta: assignee?.full_name || a.job?.title || undefined,
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

  function getItemsForDay(day: number) {
    const dayDate = new Date(year, month, day);
    const dayStart = new Date(year, month, day, 0, 0, 0);
    const dayEnd = new Date(year, month, day, 23, 59, 59);
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
  function goToday() { setCurrentDate(new Date()); setSelectedDay(new Date().getDate()); }

  const isToday = (day: number) => {
    const now = new Date();
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "auftrag": return <ClipboardList className="h-3.5 w-3.5" />;
      case "vermietung": return <Inbox className="h-3.5 w-3.5" />;
      case "termin": return <CalIcon className="h-3.5 w-3.5" />;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "auftrag": return "Auftrag";
      case "vermietung": return "Vermietung";
      case "termin": return "Termin";
    }
  };

  const selectedDayItems = selectedDay ? getItemsForDay(selectedDay) : [];

  // Alle kommenden Einträge
  const upcoming = items
    .filter((i) => i.date >= new Date())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-foreground mt-1">Aufträge, Vermietungen & Termine</p>
        </div>
        {/* Legende */}
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Aufträge</span>
          <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Vermietungen</span>
          <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Termine</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Kalender */}
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={goToday}>Heute</Button>
              </div>
              <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
              {days.map((day, i) => {
                const dayItems = day ? getItemsForDay(day) : [];
                const isSelected = day === selectedDay;
                return (
                  <div
                    key={i}
                    onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                    className={`min-h-[90px] p-1.5 bg-white cursor-pointer transition-colors ${
                      !day ? "bg-gray-50" : isSelected ? "bg-red-50 ring-2 ring-red-500 ring-inset" : "hover:bg-gray-50"
                    }`}
                  >
                    {day && (
                      <>
                        <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${
                          isToday(day) ? "bg-red-500 text-white" : "text-gray-700"
                        }`}>
                          {day}
                        </span>
                        <div className="mt-0.5 space-y-0.5">
                          {dayItems.slice(0, 3).map((item) => {
                            const isMultiDay = item.endDate && item.endDate.getTime() > item.date.getTime() + 86400000;
                            return (
                              <div key={item.id} className={`px-1 py-0.5 text-[9px] font-medium rounded ${item.bgColor} ${item.color} truncate ${isMultiDay ? "border-l-2 border-current" : ""}`}>
                                {item.time && <span className="mr-1">{item.time}</span>}
                                {item.title}
                              </div>
                            );
                          })}
                          {dayItems.length > 3 && (
                            <div className="text-[9px] text-muted-foreground px-1">+{dayItems.length - 3}</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar: Selected Day or Upcoming */}
        <div className="space-y-6">
          {selectedDay ? (
            <Card className="bg-white">
              <CardContent className="p-5">
                <h3 className="font-semibold mb-3">
                  {selectedDay}. {currentDate.toLocaleDateString("de-CH", { month: "long" })}
                </h3>
                {selectedDayItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Einträge an diesem Tag.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayItems.map((item) => (
                      <div key={item.id} className="group">
                        {item.link ? (
                          <Link href={item.link}>
                            <div className={`p-3 rounded-xl ${item.bgColor} hover:shadow-sm transition-all cursor-pointer`}>
                              <div className="flex items-center gap-2">
                                <span className={item.color}>{typeIcon(item.type)}</span>
                                <span className={`text-xs font-medium ${item.color}`}>{typeLabel(item.type)}</span>
                                {item.time && <span className="text-xs text-muted-foreground ml-auto">{item.time}</span>}
                              </div>
                              <p className="font-medium text-sm mt-1">{item.title}</p>
                              {item.meta && <p className="text-xs text-muted-foreground mt-0.5">{item.meta}</p>}
                            </div>
                          </Link>
                        ) : (
                          <div className={`p-3 rounded-xl ${item.bgColor}`}>
                            <div className="flex items-center gap-2">
                              <span className={item.color}>{typeIcon(item.type)}</span>
                              <span className={`text-xs font-medium ${item.color}`}>{typeLabel(item.type)}</span>
                              {item.time && <span className="text-xs text-muted-foreground ml-auto">{item.time}</span>}
                            </div>
                            <p className="font-medium text-sm mt-1">{item.title}</p>
                            {item.meta && <p className="text-xs text-muted-foreground mt-0.5">{item.meta}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="bg-white">
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Kommende Einträge</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine kommenden Einträge.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="text-center min-w-[40px]">
                        <div className="text-sm font-bold">{item.date.getDate()}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">{item.date.toLocaleDateString("de-CH", { month: "short" })}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={item.color}>{typeIcon(item.type)}</span>
                          <span className="text-sm font-medium truncate">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {item.time && <span>{item.time}</span>}
                          {item.meta && <span className="truncate">{item.meta}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
