"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  ClipboardList, Inbox, Clock, Users, ArrowRight, TrendingUp, Plus,
  Ticket, Check, X, ShoppingCart, Monitor, Wrench, HelpCircle,
  LinkIcon, ExternalLink, Trash2,
} from "lucide-react";
import { JOB_PRIORITY } from "@/lib/constants";
import type { Todo } from "@/types";
import { toast } from "sonner";

const CATEGORY_ICONS: Record<string, any> = {
  bestellung: ShoppingCart,
  it: Monitor,
  reparatur: Wrench,
  sonstiges: HelpCircle,
};
const CATEGORY_COLORS: Record<string, string> = {
  bestellung: "bg-blue-50 text-blue-600",
  it: "bg-red-50 text-red-600",
  reparatur: "bg-orange-50 text-orange-600",
  sonstiges: "bg-gray-100 text-gray-600",
};

interface TicketItem {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  created_by: string;
  created_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ offeneAuftraege: 0, neueAnfragen: 0, aktiveTechniker: 0, kundenTotal: 0 });
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [myTodos, setMyTodos] = useState<Todo[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [quickLinks, setQuickLinks] = useState<{ name: string; url: string }[]>([]);
  const [jobsOhneTermin, setJobsOhneTermin] = useState<{ id: string; title: string; job_number: number; start_date: string | null }[]>([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState({ name: "", url: "" });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const supabase = createClient();

  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => { loadData(); }, []);

  async function saveLinksToServer(userId: string, links: { name: string; url: string }[]) {
    await fetch("/api/user-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, quick_links: links }),
    });
  }

  function updateLinks(newLinks: { name: string; url: string }[]) {
    setQuickLinks(newLinks);
    if (currentUserId) saveLinksToServer(currentUserId, newLinks);
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data: profile } = await supabase.from("profiles").select("full_name, email, role").eq("id", user.id).single();
    if (profile) {
      setUserName(profile.full_name.split(" ")[0]);
      setUserEmail(profile.email);
      setIsAdmin(profile.role === "admin");
    }

    // Quick Links laden
    try {
      const linksRes = await fetch(`/api/user-settings?userId=${user.id}`);
      const linksJson = await linksRes.json();
      if (linksJson.quick_links?.length > 0) {
        setQuickLinks(linksJson.quick_links);
      } else {
        // Migration: localStorage → DB
        const saved = localStorage.getItem("dashboard-links");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.length > 0) {
              setQuickLinks(parsed);
              await saveLinksToServer(user.id, parsed);
              localStorage.removeItem("dashboard-links");
            }
          } catch {}
        }
      }
    } catch {}

    const [jobsRes, anfragenRes, timeRes, kundenRes] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).in("status", ["offen", "geplant", "in_arbeit"]),
      supabase.from("rental_requests").select("id", { count: "exact", head: true }).eq("status", "neu"),
      supabase.from("time_entries").select("id", { count: "exact", head: true }).is("clock_out", null),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);

    setStats({
      offeneAuftraege: jobsRes.count ?? 0,
      neueAnfragen: anfragenRes.count ?? 0,
      aktiveTechniker: timeRes.count ?? 0,
      kundenTotal: kundenRes.count ?? 0,
    });

    // Aufträge ohne Termine finden — nur die nächsten 3 nach Startdatum
    const { data: activeJobs } = await supabase.from("jobs").select("id, title, job_number, start_date").in("status", ["offen", "geplant", "in_arbeit"]).neq("is_deleted", true).order("start_date", { ascending: true, nullsFirst: false });
    const { data: allAppts } = await supabase.from("job_appointments").select("job_id");
    if (activeJobs && allAppts) {
      const jobsWithAppts = new Set(allAppts.map((a: any) => a.job_id).filter(Boolean));
      setJobsOhneTermin((activeJobs as any[]).filter((j) => !jobsWithAppts.has(j.id)).slice(0, 3));
    }

    // Meine Todos
    const { data: todosData } = await supabase
      .from("todos").select("*").eq("assigned_to", user.id).eq("status", "offen")
      .order("created_at", { ascending: false }).limit(5);
    if (todosData) setMyTodos(todosData as unknown as Todo[]);

    // Tickets laden
    const { data: ticketsData } = await supabase
      .from("tickets").select("*").order("created_at", { ascending: false });
    if (ticketsData) setTickets(ticketsData as unknown as TicketItem[]);

    // Profil-Namen laden
    const { data: allProfiles } = await supabase.from("profiles").select("id, full_name, email");
    if (allProfiles) {
      const map: Record<string, string> = {};
      allProfiles.forEach((p: any) => { map[p.id] = p.full_name; });
      setProfiles(map);
    }
  }

  async function handleTicket(ticket: TicketItem, action: "genehmigt" | "abgelehnt") {
    try {
      // E-Mail an Ersteller senden
      await fetch("/api/tickets/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, action, ticketTitle: ticket.title, createdBy: ticket.created_by }),
      });
      // Push-Benachrichtigung an Ersteller
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [ticket.created_by],
          title: action === "genehmigt" ? `✅ Ticket genehmigt: ${ticket.title}` : `❌ Ticket abgelehnt: ${ticket.title}`,
          message: action === "genehmigt" ? "Deine Anfrage wird bearbeitet." : "Bei Fragen wende dich an die Geschäftsleitung.",
          link: "/tickets",
        }),
      });
      // Remove from list
      await supabase.from("tickets").delete().eq("id", ticket.id);
      setTickets(tickets.filter((t) => t.id !== ticket.id));
      toast.success(action === "genehmigt" ? "Ticket genehmigt — E-Mail gesendet" : "Ticket abgelehnt — E-Mail gesendet");
    } catch {
      toast.error("Fehler beim Bearbeiten");
    }
  }

  const statCards = [
    { label: "Offene Aufträge", value: stats.offeneAuftraege, icon: ClipboardList, iconBg: "bg-blue-50 text-blue-600", href: "/auftraege" },
    { label: "Neue Vermietungen", value: stats.neueAnfragen, icon: Inbox, iconBg: "bg-amber-50 text-amber-600", href: "/anfragen" },
    { label: "Aktive Techniker", value: stats.aktiveTechniker, icon: Users, iconBg: "bg-emerald-50 text-emerald-600", href: "/zeiterfassung" },
    { label: "Kunden", value: stats.kundenTotal, icon: TrendingUp, iconBg: "bg-violet-50 text-violet-600", href: "/kunden" },
    { label: "Offene Tickets", value: tickets.length, icon: Ticket, iconBg: "bg-red-50 text-red-600", href: "/tickets" },
  ];

  const quickActions = [
    { href: "/auftraege/neu", label: "Neuer Auftrag", icon: ClipboardList, desc: "Auftrag erstellen" },
    { href: "/anfragen/neu", label: "Neue Vermietung", icon: Inbox, desc: "Vermietung erfassen" },
    { href: "/kunden/neu", label: "Neuer Kunde", icon: Users, desc: "Kunde anlegen" },
    { href: "/zeiterfassung", label: "Einstempeln", icon: Clock, desc: "Zeit erfassen" },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting}{userName ? `, ${userName}` : ""}</h1>
        <p className="text-sm text-muted-foreground mt-1">Hier ist deine Übersicht.</p>
      </div>

      {/* Meine Todos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meine Todos</h2>
          <Link href="/todos" className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">Alle anzeigen <ArrowRight className="h-3 w-3" /></Link>
        </div>
        {myTodos.length === 0 ? (
          <Card className="bg-white border-gray-100">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">Keine offenen Todos für dich.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {myTodos.map((todo) => (
              <Card key={todo.id} className="bg-white border-gray-100 hover:shadow-sm transition-all">
                <CardContent className="p-3.5 flex items-center gap-3">
                  <button
                    onClick={async () => {
                      await supabase.from("todos").update({ status: "erledigt", completed_at: new Date().toISOString() }).eq("id", todo.id);
                      setMyTodos(myTodos.filter((t) => t.id !== todo.id));
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded-md border-2 border-gray-300 hover:border-red-400 shrink-0 transition-all"
                  />
                  <Link href="/todos" className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{todo.title}</span>
                      <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${JOB_PRIORITY[todo.priority].color}`}>{JOB_PRIORITY[todo.priority].label}</span>
                    </div>
                    {todo.due_date && <p className="text-xs text-muted-foreground mt-0.5">Fällig: {new Date(todo.due_date).toLocaleDateString("de-CH")}</p>}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Aufträge ohne Termin - nur für Leo */}
      {jobsOhneTermin.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 text-orange-500" />Nächste Aufträge ohne Termin
            </h2>
            <Link href="/auftraege" className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">Alle anzeigen <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="space-y-1">
            {jobsOhneTermin.map((j) => (
              <Link key={j.id} href={`/auftraege/${j.id}`}>
                <Card className="bg-white border-orange-100 hover:shadow-sm transition-all">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-orange-600">INT-{j.job_number}</span>
                      <span className="font-medium text-sm">{j.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {j.start_date && <span className="text-[10px] text-muted-foreground">bis {new Date(j.start_date).toLocaleDateString("de-CH")}</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Kein Termin</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Offene Tickets */}
      {tickets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offene Tickets ({tickets.length})</h2>
            <Link href="/tickets" className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">Alle anzeigen <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="space-y-2">
            {tickets.map((ticket) => {
              const CatIcon = CATEGORY_ICONS[ticket.category] || HelpCircle;
              const catColor = CATEGORY_COLORS[ticket.category] || CATEGORY_COLORS.sonstiges;
              return (
                <Card key={ticket.id} className="bg-white border-gray-100">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5 ${catColor}`}>
                        <CatIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{ticket.title}</span>
                          {ticket.priority === "dringend" && <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-100 text-red-600">Dringend</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ticket.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">Von {profiles[ticket.created_by] || "Unbekannt"} · {new Date(ticket.created_at).toLocaleDateString("de-CH")}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTicket(ticket, "genehmigt")}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium border border-green-200 hover:bg-green-100 transition-colors"
                        >
                          <Check className="h-4 w-4" />Genehmigen
                        </button>
                        <button
                          onClick={() => handleTicket(ticket, "abgelehnt")}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          <X className="h-4 w-4" />Ablehnen
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Schnelllinks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><LinkIcon className="h-3.5 w-3.5" />Schnelllinks</h2>
          <button onClick={() => setShowLinkForm(!showLinkForm)} className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">
            {showLinkForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {showLinkForm ? "Abbrechen" : "Link hinzufügen"}
          </button>
        </div>
        {showLinkForm && (
          <Card className="bg-white border-gray-100 mb-3">
            <CardContent className="p-4">
              <form onSubmit={(e) => {
                e.preventDefault();
                let url = linkForm.url.trim();
                if (url && !url.startsWith("http")) url = "https://" + url;
                const name = linkForm.name.trim() || new URL(url).hostname;
                const updated = [...quickLinks, { name, url }];
                updateLinks(updated);
                setLinkForm({ name: "", url: "" });
                setShowLinkForm(false);
              }} className="flex gap-3">
                <input value={linkForm.name} onChange={(e) => setLinkForm({ ...linkForm, name: e.target.value })} placeholder="Name (z.B. Dropbox)" className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
                <input value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} placeholder="https://..." className="flex-[2] px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20" required />
                <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">Hinzufügen</button>
              </form>
            </CardContent>
          </Card>
        )}
        {quickLinks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((link, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null || dragIndex === i) return;
                  const updated = [...quickLinks];
                  const [moved] = updated.splice(dragIndex, 1);
                  updated.splice(i, 0, moved);
                  setQuickLinks(updated);
                  localStorage.setItem("dashboard-links", JSON.stringify(updated));
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`relative group cursor-grab active:cursor-grabbing ${dragIndex === i ? "opacity-30" : ""}`}
              >
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-700 text-xs font-medium border border-gray-200 hover:shadow-sm hover:border-gray-300 transition-all">
                  {link.name} <ExternalLink className="h-3 w-3 text-gray-400" />
                </a>
                <button onClick={(e) => {
                  e.preventDefault();
                  const updated = quickLinks.filter((_, j) => j !== i);
                  setQuickLinks(updated);
                  localStorage.setItem("dashboard-links", JSON.stringify(updated));
                }} className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors opacity-0 group-hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : !showLinkForm && (
          <Card className="bg-white border-gray-100 border-dashed">
            <CardContent className="py-4 text-center">
              <p className="text-sm text-muted-foreground">Noch keine Links. Füge häufig genutzte Links hinzu.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="bg-white border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-200 cursor-pointer group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${stat.iconBg}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-gray-400 transition-colors" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Schnellaktionen</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="bg-white border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-200 cursor-pointer group h-full">
                <CardContent className="p-4">
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors duration-200">
                    <Plus className="h-4 w-4" />
                  </div>
                  <h3 className="font-semibold mt-2.5 text-sm">{action.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{action.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
