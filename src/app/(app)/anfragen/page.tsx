"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { RENTAL_STATUS } from "@/lib/constants";
import type { RentalRequest, RentalStatus } from "@/types";
import Link from "next/link";
import { Plus, Search, Inbox, Calendar, MapPin, Users } from "lucide-react";

export default function AnfragenPage() {
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<RentalStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => { loadRequests(); }, []);

  async function loadRequests() {
    const { data } = await supabase
      .from("rental_requests")
      .select("*, customer:customers(name), location:locations(name)")
      .order("created_at", { ascending: false });
    if (data) setRequests(data as unknown as RentalRequest[]);
    setLoading(false);
  }

  async function updateStatus(id: string, status: RentalStatus) {
    await supabase.from("rental_requests").update({ status }).eq("id", id);
    loadRequests();
  }

  const filtered = requests.filter((r) => {
    const name = (r.customer as unknown as { name: string })?.name || "";
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase()) ||
      (r.event_type?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vermietungen</h1>
          <p className="text-sm text-muted-foreground mt-1">{requests.length} Vermietungen</p>
        </div>
        <Link href="/anfragen/neu">
          <Button className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
            <Plus className="h-4 w-4 mr-2" />
            Neue Vermietung
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Vermietungen suchen..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-white border-gray-200" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterStatus("all")} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filterStatus === "all" ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>Alle</button>
          {(Object.keys(RENTAL_STATUS) as RentalStatus[]).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filterStatus === s ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>{RENTAL_STATUS[s].label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-white"><CardContent className="p-5"><div className="h-5 bg-gray-200 rounded w-1/2 mb-3" /><div className="h-4 bg-gray-100 rounded w-1/3" /></CardContent></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed bg-white">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Inbox className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">{search ? "Keine Ergebnisse" : "Noch keine Vermietungen"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{search ? "Versuche andere Filter." : "Erstelle deine erste Vermietung."}</p>
            {!search && <Link href="/anfragen/neu"><Button className="mt-5 bg-red-600 hover:bg-red-700 text-white"><Plus className="h-4 w-4 mr-2" />Erste Vermietung erstellen</Button></Link>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <Card key={req.id} className="bg-white hover:shadow-md transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold truncate">{(req.customer as unknown as { name: string })?.name}</h3>
                      <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${RENTAL_STATUS[req.status].color}`}>{RENTAL_STATUS[req.status].label}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      {(req.location as unknown as { name: string })?.name && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{(req.location as unknown as { name: string }).name}</span>}
                      {req.event_date && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(req.event_date).toLocaleDateString("de-CH")}</span>}
                      {req.guest_count && <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{req.guest_count} Pers.</span>}
                    </div>
                    {req.event_type && <p className="mt-1 text-sm text-muted-foreground">{req.event_type}</p>}
                  </div>
                  <div className="flex gap-2">
                    {req.status === "neu" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(req.id, "in_bearbeitung")}>Bearbeiten</Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatus(req.id, "bestaetigt")}>Bestätigen</Button>
                      </>
                    )}
                    {req.status === "in_bearbeitung" && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatus(req.id, "bestaetigt")}>Bestätigen</Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(req.id, "abgelehnt")}>Ablehnen</Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
