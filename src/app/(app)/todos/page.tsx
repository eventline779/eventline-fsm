"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_PRIORITY } from "@/lib/constants";
import type { Todo, Profile, JobPriority } from "@/types";
import { Plus, Check, CheckSquare, Calendar, User, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "offen" | "erledigt">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal" as JobPriority, due_date: "", assigned_to: "" });
  const supabase = createClient();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [todosRes, profRes] = await Promise.all([
      supabase.from("todos").select("*, assignee:profiles!assigned_to(full_name)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
    ]);
    if (todosRes.data) setTodos(todosRes.data as unknown as Todo[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    setLoading(false);
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("todos").insert({
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: form.assigned_to || null,
      created_by: user?.id,
    });
    setForm({ title: "", description: "", priority: "normal", due_date: "", assigned_to: "" });
    setShowForm(false);
    loadData();
    toast.success("Todo erstellt");
  }

  async function toggleTodo(id: string, currentStatus: string) {
    const newStatus = currentStatus === "offen" ? "erledigt" : "offen";
    await supabase.from("todos").update({ status: newStatus, completed_at: newStatus === "erledigt" ? new Date().toISOString() : null }).eq("id", id);
    loadData();
  }

  async function deleteTodo(id: string) {
    await supabase.from("todos").delete().eq("id", id);
    loadData();
  }

  const filtered = todos.filter((t) => filter === "all" || t.status === filter);
  const openCount = todos.filter((t) => t.status === "offen").length;

  const priorities: { value: JobPriority; label: string; color: string }[] = [
    { value: "niedrig", label: "Niedrig", color: "border-gray-200 bg-gray-50 text-gray-600" },
    { value: "normal", label: "Normal", color: "border-blue-200 bg-blue-50 text-blue-700" },
    { value: "hoch", label: "Hoch", color: "border-orange-200 bg-orange-50 text-orange-700" },
    { value: "dringend", label: "Dringend", color: "border-red-200 bg-red-50 text-red-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Todos</h1>
          <p className="text-sm text-muted-foreground mt-1">{openCount} offen von {todos.length}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
          <Plus className="h-4 w-4 mr-2" />Neues Todo
        </Button>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card className="bg-white border-red-100">
          <CardContent className="p-6">
            <form onSubmit={addTodo} className="space-y-4">
              <Input placeholder="Was muss erledigt werden? *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-gray-50" required />
              <textarea placeholder="Details (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={2} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priorität</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as JobPriority })} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                    {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Fällig am</label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Zuweisen an</label>
                  <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                    <option value="">Niemand</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
                <Button type="submit" disabled={!form.title} className="bg-red-600 hover:bg-red-700 text-white">Todo erstellen</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "offen", "erledigt"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filter === f ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>
            {f === "all" ? `Alle (${todos.length})` : f === "offen" ? `Offen (${openCount})` : `Erledigt (${todos.length - openCount})`}
          </button>
        ))}
      </div>

      {/* Todo List */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-white"><CardContent className="p-4"><div className="h-5 bg-gray-200 rounded w-1/2" /></CardContent></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-white border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><CheckSquare className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">{filter === "erledigt" ? "Noch nichts erledigt" : "Keine offenen Todos"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{filter === "all" ? "Erstelle dein erstes Todo." : ""}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((todo) => {
            const assignee = (todo as unknown as { assignee: { full_name: string } | null }).assignee;
            return (
              <Card key={todo.id} className={`bg-white transition-all ${todo.status === "erledigt" ? "opacity-60" : "hover:shadow-sm"}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button onClick={() => toggleTodo(todo.id, todo.status)} className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-all ${todo.status === "erledigt" ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-red-400"}`}>
                      {todo.status === "erledigt" && <Check className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${todo.status === "erledigt" ? "line-through text-muted-foreground" : ""}`}>{todo.title}</span>
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${JOB_PRIORITY[todo.priority].color}`}>{JOB_PRIORITY[todo.priority].label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {todo.due_date && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{new Date(todo.due_date).toLocaleDateString("de-CH")}</span>}
                        {assignee && <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" />{assignee.full_name}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => deleteTodo(todo.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors shrink-0"><Trash2 className="h-4 w-4" /></button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
