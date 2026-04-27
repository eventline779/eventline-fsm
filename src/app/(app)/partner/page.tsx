"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Plus,
  Search,
  Mail,
  Phone,
  Globe,
  Star,
  MapPin,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

const PARTNER_TYPES = {
  catering: { label: "Catering", color: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  technik: { label: "Technik", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  av: { label: "AV / Sound", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
  mobiliar: { label: "Mobiliar", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  reinigung: { label: "Reinigung", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" },
  security: { label: "Security", color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  sonstiges: { label: "Sonstiges", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300" },
} as const;

type PartnerType = keyof typeof PARTNER_TYPES;

type Partner = {
  id: string;
  name: string;
  type: PartnerType;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_city: string | null;
  notes: string | null;
  rating: number | null;
  is_active: boolean;
};

const EMPTY_FORM: Omit<Partner, "id" | "is_active"> = {
  name: "",
  type: "catering",
  contact_person: "",
  email: "",
  phone: "",
  website: "",
  address_city: "",
  notes: "",
  rating: null,
};

export default function PartnerPage() {
  const supabase = createClient();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<PartnerType | "all">("all");
  const [editing, setEditing] = useState<Partner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("partners")
      .select("*")
      .eq("is_active", true)
      .order("name");
    setPartners((data as Partner[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p: Partner) {
    setEditing(p);
    setForm({
      name: p.name,
      type: p.type,
      contact_person: p.contact_person ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      website: p.website ?? "",
      address_city: p.address_city ?? "",
      notes: p.notes ?? "",
      rating: p.rating,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name ist Pflichtfeld");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      contact_person: form.contact_person?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      website: form.website?.trim() || null,
      address_city: form.address_city?.trim() || null,
      notes: form.notes?.trim() || null,
      rating: form.rating || null,
    };
    if (editing) {
      const { error } = await supabase
        .from("partners")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast.error("Fehler beim Speichern");
        setSaving(false);
        return;
      }
      toast.success("Aktualisiert");
    } else {
      const { error } = await supabase.from("partners").insert(payload);
      if (error) {
        toast.error("Fehler beim Speichern");
        setSaving(false);
        return;
      }
      toast.success("Partner angelegt");
    }
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleDelete(p: Partner) {
    if (!confirm(`Partner "${p.name}" wirklich löschen?`)) return;
    const { error } = await supabase
      .from("partners")
      .update({ is_active: false })
      .eq("id", p.id);
    if (error) {
      toast.error("Fehler beim Löschen");
      return;
    }
    toast.success("Gelöscht");
    load();
  }

  const filtered = partners.filter((p) => {
    if (filterType !== "all" && p.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.contact_person?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.address_city?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Partner & Lieferanten
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catering, Technik, AV, Mobiliar — alle Partner an einem Ort.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="kasten kasten-red"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer Partner
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filterType === "all"
                ? "bg-foreground text-background"
                : "bg-muted hover:bg-muted/70"
            }`}
          >
            Alle ({partners.length})
          </button>
          {(Object.keys(PARTNER_TYPES) as PartnerType[]).map((t) => {
            const count = partners.filter((p) => p.type === t).length;
            if (count === 0) return null;
            return (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filterType === t
                    ? "bg-foreground text-background"
                    : "bg-muted hover:bg-muted/70"
                }`}
              >
                {PARTNER_TYPES[t].label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {partners.length === 0
              ? "Noch keine Partner angelegt."
              : "Keine Partner für diese Filter gefunden."}
          </p>
          {partners.length === 0 && (
            <button
              type="button"
              onClick={openNew}
              className="mt-4 kasten kasten-red"
            >
              Ersten Partner anlegen
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                        PARTNER_TYPES[p.type].color
                      }`}
                    >
                      {PARTNER_TYPES[p.type].label}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 rounded text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors"
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {p.rating && (
                  <div className="flex gap-0.5 mt-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < (p.rating ?? 0)
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-1 text-xs">
                  {p.contact_person && (
                    <div className="text-muted-foreground">{p.contact_person}</div>
                  )}
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      className="flex items-center gap-1.5 text-foreground hover:underline truncate"
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.email}</span>
                    </a>
                  )}
                  {p.phone && (
                    <a
                      href={`tel:${p.phone}`}
                      className="flex items-center gap-1.5 text-foreground hover:underline"
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{p.phone}</span>
                    </a>
                  )}
                  {p.website && (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1.5 text-foreground hover:underline truncate"
                    >
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {p.website.replace(/^https?:\/\//, "")}
                      </span>
                    </a>
                  )}
                  {p.address_city && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{p.address_city}</span>
                    </div>
                  )}
                </div>

                {p.notes && (
                  <p className="mt-3 pt-3 border-t text-xs text-muted-foreground line-clamp-3">
                    {p.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editing ? "Partner bearbeiten" : "Neuer Partner"}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="px-4 pb-6 space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="type">Kategorie</Label>
              <select
                id="type"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as PartnerType })
                }
                className="w-full h-9 rounded-lg border bg-background px-3 text-sm"
              >
                {(Object.keys(PARTNER_TYPES) as PartnerType[]).map((t) => (
                  <option key={t} value={t}>
                    {PARTNER_TYPES[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="contact_person">Ansprechperson</Label>
              <Input
                id="contact_person"
                value={form.contact_person ?? ""}
                onChange={(e) =>
                  setForm({ ...form, contact_person: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://…"
                value={form.website ?? ""}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="city">Ort</Label>
              <Input
                id="city"
                value={form.address_city ?? ""}
                onChange={(e) =>
                  setForm({ ...form, address_city: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Bewertung</Label>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        rating: form.rating === n ? null : n,
                      })
                    }
                    className="p-1 hover:scale-110 transition"
                  >
                    <Star
                      className={`h-5 w-5 ${
                        n <= (form.rating ?? 0)
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notizen</Label>
              <textarea
                id="notes"
                rows={3}
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-lg border bg-background p-2 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="kasten kasten-muted flex-1"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="kasten kasten-red flex-1"
              >
                {saving ? "Speichert…" : editing ? "Speichern" : "Anlegen"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
