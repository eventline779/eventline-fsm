"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Send, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function ITTicketsPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal" });
  const [sending, setSending] = useState(false);
  const supabase = createClient();

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user?.id).single();

    // In tickets-Tabelle speichern
    await supabase.from("tickets").insert({
      title: form.subject,
      description: form.description,
      category: "it",
      priority: form.priority === "kritisch" ? "dringend" : "normal",
      created_by: user?.id,
    });

    // Push-Benachrichtigung an Leo + Mischa
    try {
      const { data: admins } = await supabase.from("profiles").select("id").in("email", ["leo@eventline-basel.com", "mischa@eventline-basel.com"]);
      if (admins && admins.length > 0) {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: admins.map((a: any) => a.id),
            title: `💻 IT-Ticket: ${form.subject}`,
            message: `Von ${profile?.full_name || "Unbekannt"} · ${form.priority === "kritisch" ? "Kritisch" : form.priority}`,
            link: "/it-tickets",
          }),
        });
      }
      toast.success("IT-Ticket erstellt");
      setForm({ subject: "", description: "", priority: "normal" });
      setShowForm(false);
    } catch {
      toast.error("Fehler beim Senden");
    }
    setSending(false);
  }

  const priorityOptions = [
    { value: "niedrig", label: "Niedrig", color: "bg-gray-100 text-gray-700" },
    { value: "normal", label: "Normal", color: "bg-blue-100 text-blue-700" },
    { value: "hoch", label: "Hoch", color: "bg-orange-100 text-orange-700" },
    { value: "kritisch", label: "Kritisch", color: "bg-red-100 text-red-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IT-Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">IT-Probleme melden – Tickets gehen an Mischa Dittus (IT)</p>
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
            <form onSubmit={submitTicket} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Betreff *</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="z.B. Drucker funktioniert nicht, WLAN-Probleme..."
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Beschreibung *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Beschreibe das Problem so genau wie möglich. Was hast du gemacht? Was passiert? Was sollte passieren?"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  rows={5}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Priorität</label>
                <div className="flex gap-2 mt-1">
                  {priorityOptions.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, priority: p.value })}
                      className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${form.priority === p.value ? p.color + " border-current" : "bg-card text-gray-500 border-gray-200"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
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
                  disabled={sending || !form.subject || !form.description}
                  className="kasten kasten-red"
                >
                  <Send className="h-3.5 w-3.5" />{sending ? "Senden..." : "Ticket senden"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!showForm && (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>
            <h3 className="font-semibold text-lg">IT-Support</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Hast du ein technisches Problem? Erstelle ein IT-Ticket und Mischa (IT) wird sich darum kümmern.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 inline-kasten kasten-red"
            >
              <Plus className="h-3.5 w-3.5" />Neues Ticket erstellen
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
