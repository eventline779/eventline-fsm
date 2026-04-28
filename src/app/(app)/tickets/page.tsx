"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Profile } from "@/types";
import {
  Plus, Ticket, ShoppingCart, Monitor, Wrench, HelpCircle,
  ArrowLeft, Upload, FileText, Image as ImageIcon, Trash2, Download, X, Send, Check,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/use-confirm";

interface TicketItem {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  created_by: string;
  created_at: string;
  attachments?: { name: string; path: string; uploaded_at: string }[];
}

const CATEGORIES = [
  { value: "bestellung", label: "Bestellung", icon: ShoppingCart, color: "bg-blue-50 text-blue-600" },
  { value: "it", label: "IT-Problem", icon: Monitor, color: "bg-red-50 text-red-600" },
  { value: "reparatur", label: "Reparatur", icon: Wrench, color: "bg-orange-50 text-orange-600" },
  { value: "sonstiges", label: "Sonstiges", icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
];

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "bestellung", priority: "normal" });
  const [sending, setSending] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const { confirm, ConfirmModalElement } = useConfirm();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    const [profRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("is_active", true),
    ]);
    if (profRes.data) {
      setProfiles(profRes.data as Profile[]);
      const me = (profRes.data as Profile[]).find((p) => p.id === user?.id);
      if (me?.role === "admin") {
        setIsAdmin(true);
        const { data: ticketsData } = await supabase.from("tickets").select("*").order("created_at", { ascending: false });
        if (ticketsData) setTickets(ticketsData as unknown as TicketItem[]);
      }
    }
  }

  function getProfileName(id: string) {
    return profiles.find((p) => p.id === id)?.full_name || "Unbekannt";
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const profile = profiles.find((p) => p.id === user?.id);

    // Save to DB
    const { data, error } = await supabase.from("tickets").insert({
      title: form.title,
      description: form.description,
      category: form.category,
      priority: form.priority,
      created_by: user?.id,
    }).select().single();

    if (error) {
      // Table might not exist yet, send email anyway
    }

    // Push-Benachrichtigung an Leo + Mischa
    const notifyEmails = form.category === "bestellung"
      ? ["leo@eventline-basel.com", "mischa@eventline-basel.com"]
      : ["mischa@eventline-basel.com"];
    const { data: admins } = await supabase.from("profiles").select("id").in("email", notifyEmails);
    if (admins && admins.length > 0) {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: admins.map((a: any) => a.id),
          title: `${form.priority === "dringend" ? "🚨 " : ""}Neues Ticket: ${form.title}`,
          message: `Von ${profile?.full_name || "Unbekannt"} · ${form.category === "bestellung" ? "Bestellung" : form.category === "it" ? "IT-Problem" : form.category === "reparatur" ? "Reparatur" : "Sonstiges"}`,
          link: "/tickets",
        }),
      });
    }

    // E-Mail an Mischa (+ Leo bei Bestellungen)
    await fetch("/api/tickets/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        reporter: profile?.full_name || "Unbekannt",
        reporterEmail: profile?.email,
      }),
    });

    toast.success("Ticket erstellt");
    setForm({ title: "", description: "", category: "bestellung", priority: "normal" });
    setShowForm(false);
    setSending(false);
    if (!isAdmin) setSubmitted(true);
    loadData();
  }

  async function deleteTicket(id: string) {
    const ok = await confirm({
      title: "Ticket löschen?",
      confirmLabel: "Löschen",
      variant: "red",
    });
    if (!ok) return;
    await supabase.from("tickets").delete().eq("id", id);
    setSelectedTicket(null);
    loadData();
    toast.success("Ticket gelöscht");
  }

  async function completeTicket(ticket: TicketItem) {
    const ok = await confirm({
      title: "Ticket als erledigt markieren?",
      message: "Der Ersteller wird benachrichtigt.",
      confirmLabel: "Erledigt",
      variant: "blue",
    });
    if (!ok) return;
    const { data: { user } } = await supabase.auth.getUser();
    const me = profiles.find((p) => p.id === user?.id);
    try {
      const res = await fetch("/api/tickets/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          createdBy: ticket.created_by,
          completedBy: me?.full_name || "Unbekannt",
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Ticket erledigt — Ersteller wurde benachrichtigt");
        setSelectedTicket(null);
        loadData();
      } else {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
      }
    } catch {
      toast.error("Fehler beim Erledigen");
    }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    setUploading(true);
    const path = `tickets/${selectedTicket.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
    if (error) { toast.error("Upload fehlgeschlagen"); setUploading(false); e.target.value = ""; return; }
    const newAttachments = [...(selectedTicket.attachments || []), { name: file.name, path, uploaded_at: new Date().toISOString() }];
    await supabase.from("tickets").update({ attachments: newAttachments }).eq("id", selectedTicket.id);
    setSelectedTicket({ ...selectedTicket, attachments: newAttachments });
    toast.success("Datei hochgeladen");
    setUploading(false);
    e.target.value = "";
    loadData();
  }

  async function deleteAttachment(att: { name: string; path: string }) {
    if (!selectedTicket) return;
    await supabase.storage.from("documents").remove([att.path]);
    const newAttachments = (selectedTicket.attachments || []).filter((a) => a.path !== att.path);
    await supabase.from("tickets").update({ attachments: newAttachments }).eq("id", selectedTicket.id);
    setSelectedTicket({ ...selectedTicket, attachments: newAttachments });
    toast.success("Datei gelöscht");
    loadData();
  }

  function openFile(path: string) {
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    window.open(data.publicUrl, "_blank");
  }

  const getCat = (val: string) => CATEGORIES.find((c) => c.value === val) || CATEGORIES[3];

  // Detail view
  if (selectedTicket) {
    const cat = getCat(selectedTicket.category);
    const atts = selectedTicket.attachments || [];
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedTicket(null)} className="p-2 rounded-lg hover:bg-card transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{selectedTicket.title}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${cat.color}`}>
                <cat.icon className="h-3 w-3" />{cat.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Von {getProfileName(selectedTicket.created_by)} · {new Date(selectedTicket.created_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>

        <Card className="bg-card">
          <CardContent className="p-5 space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => completeTicket(selectedTicket)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium border border-green-200 hover:bg-green-100 transition-colors">
                <Check className="h-4 w-4" />Als erledigt markieren
              </button>
              <button onClick={() => deleteTicket(selectedTicket.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-200 hover:bg-red-100 transition-colors">
                <Trash2 className="h-4 w-4" />Löschen
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Anhänge */}
        <Card className="bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Anhänge ({atts.length})</h2>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="kasten kasten-muted"
              >
                <Upload className="h-3.5 w-3.5" />{uploading ? "Hochladen..." : "Datei hochladen"}
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif" onChange={uploadFile} className="hidden" />
            </div>
            <div className="space-y-2">
              {atts.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Anhänge.</p>}
              {atts.map((a) => {
                const isImage = /\.(jpg|jpeg|png|gif)$/i.test(a.name);
                return (
                  <div key={a.path} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <button onClick={() => openFile(a.path)} className="flex items-center gap-3 min-w-0 flex-1 text-left hover:text-blue-600 transition-colors">
                      {isImage ? <ImageIcon className="h-5 w-5 text-blue-500 shrink-0" /> : <FileText className="h-5 w-5 text-red-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(a.uploaded_at).toLocaleDateString("de-CH")}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button onClick={() => openFile(a.path)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"><Download className="h-4 w-4" /></button>
                      <button onClick={() => deleteAttachment(a)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        {ConfirmModalElement}
      </div>
    );
  }

  // Nicht-Admin: nur Formular + Bestätigung
  if (!isAdmin && submitted) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight">Tickets</h1></div>
        <Card className="bg-card">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
              <Send className="h-7 w-7 text-green-500" />
            </div>
            <h3 className="font-semibold text-lg">Ticket eingereicht</h3>
            <p className="text-sm text-muted-foreground mt-1">Du bekommst eine E-Mail sobald dein Ticket bearbeitet wurde.</p>
            <button
              type="button"
              onClick={() => { setSubmitted(false); setShowForm(true); }}
              className="mt-4 inline-kasten kasten-red"
            >
              <Plus className="h-3.5 w-3.5" />
              Weiteres Ticket erstellen
            </button>
          </CardContent>
        </Card>
        {ConfirmModalElement}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">{isAdmin ? "Alle Tickets verwalten" : "Bestellungen, IT-Probleme, Reparaturen anfragen"}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="kasten kasten-red"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Abbrechen" : "Neues Ticket"}
        </button>
      </div>

      {showForm && (
        <Card className="bg-card border-red-100">
          <CardContent className="p-6">
            <form onSubmit={createTicket} className="space-y-4">
              {/* Kategorie */}
              <div>
                <label className="text-sm font-medium">Kategorie</label>
                <div className="flex gap-2 mt-1">
                  {CATEGORIES.map((c) => (
                    <button key={c.value} type="button" onClick={() => setForm({ ...form, category: c.value })}
                      className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border transition-all ${form.category === c.value ? c.color + " border-current" : "bg-card text-gray-500 border-gray-200"}`}>
                      <c.icon className="h-4 w-4" />{c.label}
                    </button>
                  ))}
                </div>
              </div>
              <Input placeholder="Betreff *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-gray-50" required />
              <textarea placeholder="Beschreibung – Was wird benötigt? Details, Menge, Link..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={4} required />
              <div>
                <label className="text-sm font-medium">Priorität</label>
                <div className="flex gap-2 mt-1">
                  {[{ v: "normal", l: "Normal" }, { v: "dringend", l: "Dringend" }].map((p) => (
                    <button key={p.v} type="button" onClick={() => setForm({ ...form, priority: p.v })}
                      className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${form.priority === p.v ? (p.v === "dringend" ? "bg-red-50 text-red-700 border-red-300" : "bg-blue-50 text-blue-700 border-blue-300") : "bg-card text-gray-500 border-gray-200"}`}>
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">E-Mail geht an Mischa Dittus & Leo Balaszeskul</p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="kasten kasten-muted"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="kasten kasten-red"
                >
                  <Send className="h-3.5 w-3.5" />{sending ? "Senden..." : "Ticket erstellen"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Ticket List - nur für Admins */}
      {isAdmin && (
        tickets.length === 0 && !showForm ? (
          <Card className="bg-card border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Ticket className="h-7 w-7 text-gray-400" /></div>
              <h3 className="font-semibold text-lg">Keine offenen Tickets</h3>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => {
              const cat = getCat(t.category);
              return (
                <Card key={t.id} className="bg-card hover:shadow-sm transition-all cursor-pointer" onClick={() => { setSelectedTicket(t); }}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${cat.color}`}>
                        <cat.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{t.title}</span>
                          {t.priority === "dringend" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                              <AlertCircle className="h-2.5 w-2.5" />
                              Dringend
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{getProfileName(t.created_by)}</span>
                          <span>{new Date(t.created_at).toLocaleDateString("de-CH")}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Nicht-Admin: Info wenn kein Formular offen */}
      {!isAdmin && !showForm && (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Ticket className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">Ticket erstellen</h3>
            <p className="text-sm text-muted-foreground mt-1">Bestellungen, IT-Probleme oder Reparaturen anfragen.</p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="kasten kasten-red mt-4"
            >
              <Plus className="h-3.5 w-3.5" />Neues Ticket
            </button>
          </CardContent>
        </Card>
      )}
      {ConfirmModalElement}
    </div>
  );
}
