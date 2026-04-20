"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_PRIORITY } from "@/lib/constants";
import type { Todo, Profile, JobPriority } from "@/types";
import {
  Plus, Check, CheckSquare, Calendar, User, Trash2,
  ArrowLeft, Upload, FileText, Image as ImageIcon, X, Download, Archive,
} from "lucide-react";
import { toast } from "sonner";

interface TodoAttachment {
  name: string;
  path: string;
  uploaded_at: string;
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"offen" | "erledigt">("offen");
  const [personFilter, setPersonFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal" as JobPriority, due_date: "", assigned_to: "" });
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [attachments, setAttachments] = useState<TodoAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

    // Push-Benachrichtigung an zugewiesene Person
    if (form.assigned_to) {
      const { data: creator } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [form.assigned_to],
          title: form.priority === "dringend" ? `🚨 Dringendes Todo: ${form.title}` : `Neues Todo: ${form.title}`,
          message: `Von ${creator?.full_name || "Unbekannt"}${form.due_date ? ` · Fällig: ${(() => { const [y,m,d] = form.due_date.split("-").map(Number); return new Date(y, m-1, d, 12).toLocaleDateString("de-CH"); })()}` : ""}`,
          link: "/todos",
        }),
      });
      // Bei dringend: zusätzlich E-Mail senden
      if (form.priority === "dringend") {
        await fetch("/api/todos/urgent-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedTo: form.assigned_to,
            title: form.title,
            description: form.description || null,
            dueDate: form.due_date || null,
            creatorName: creator?.full_name || "Unbekannt",
          }),
        });
      }
    }
    toast.success("Todo erstellt");

    setForm({ title: "", description: "", priority: "normal", due_date: "", assigned_to: "" });
    setShowForm(false);
    loadData();
  }

  async function toggleTodo(id: string, currentStatus: string) {
    const newStatus = currentStatus === "offen" ? "erledigt" : "offen";
    await supabase.from("todos").update({ status: newStatus, completed_at: newStatus === "erledigt" ? new Date().toISOString() : null }).eq("id", id);
    loadData();
    if (selectedTodo?.id === id) {
      setSelectedTodo({ ...selectedTodo, status: newStatus as "offen" | "erledigt" });
    }
  }

  async function deleteTodo(id: string) {
    if (!confirm("Todo wirklich löschen?")) return;
    // Delete attachments from storage
    if (attachments.length > 0) {
      await supabase.storage.from("documents").remove(attachments.map((a) => a.path));
    }
    await supabase.from("todos").delete().eq("id", id);
    setSelectedTodo(null);
    loadData();
    toast.success("Todo gelöscht");
  }

  function openTodo(todo: Todo) {
    setSelectedTodo(todo);
    loadAttachments(todo.id);
  }

  async function loadAttachments(todoId: string) {
    const { data } = await supabase.from("todos").select("description").eq("id", todoId).single();
    if (data?.description) {
      try {
        const parsed = JSON.parse(data.description);
        if (parsed._attachments) {
          setAttachments(parsed._attachments);
          return;
        }
      } catch {}
    }
    setAttachments([]);
  }

  async function saveAttachments(todoId: string, newAttachments: TodoAttachment[]) {
    const { data } = await supabase.from("todos").select("description").eq("id", todoId).single();
    let desc = data?.description || "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(desc);
    } catch {
      parsed = { _text: desc };
    }
    parsed._attachments = newAttachments;
    await supabase.from("todos").update({ description: JSON.stringify(parsed) }).eq("id", todoId);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedTodo) return;
    setUploading(true);
    const path = `todos/${selectedTodo.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
    if (error) {
      toast.error("Upload fehlgeschlagen: " + error.message);
      setUploading(false);
      e.target.value = "";
      return;
    }
    const newAttachments = [...attachments, { name: file.name, path, uploaded_at: new Date().toISOString() }];
    await saveAttachments(selectedTodo.id, newAttachments);
    setAttachments(newAttachments);
    toast.success("Datei hochgeladen");
    setUploading(false);
    e.target.value = "";
  }

  async function deleteAttachment(att: TodoAttachment) {
    if (!selectedTodo) return;
    await supabase.storage.from("documents").remove([att.path]);
    const newAttachments = attachments.filter((a) => a.path !== att.path);
    await saveAttachments(selectedTodo.id, newAttachments);
    setAttachments(newAttachments);
    toast.success("Datei gelöscht");
  }

  function openFile(path: string) {
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    window.open(data.publicUrl, "_blank");
  }

  function getDescription(todo: Todo): string {
    if (!todo.description) return "";
    try {
      const parsed = JSON.parse(todo.description);
      return parsed._text || "";
    } catch {
      return todo.description;
    }
  }

  const filtered = todos
    .filter((t) => t.status === filter)
    .filter((t) => !personFilter || t.assigned_to === personFilter)
    .sort((a, b) => {
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  const openCount = todos.filter((t) => t.status === "offen").length;

  const priorities: { value: JobPriority; label: string }[] = [
    { value: "niedrig", label: "Niedrig" },
    { value: "normal", label: "Normal" },
    { value: "hoch", label: "Hoch" },
    { value: "dringend", label: "Dringend" },
  ];

  // Detail view
  if (selectedTodo) {
    const assignee = (selectedTodo as unknown as { assignee: { full_name: string } | null }).assignee;
    const desc = getDescription(selectedTodo);
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedTodo(null)} className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className={`text-2xl font-bold tracking-tight ${selectedTodo.status === "erledigt" ? "line-through text-muted-foreground" : ""}`}>{selectedTodo.title}</h1>
              <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${JOB_PRIORITY[selectedTodo.priority].color}`}>{JOB_PRIORITY[selectedTodo.priority].label}</span>
            </div>
          </div>
        </div>

        {/* Info */}
        <Card className="bg-white">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-4">
              <button onClick={() => toggleTodo(selectedTodo.id, selectedTodo.status)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTodo.status === "erledigt" ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-700 border border-gray-200 hover:border-red-300"}`}>
                <Check className="h-4 w-4" />
                {selectedTodo.status === "erledigt" ? "Erledigt" : "Als erledigt markieren"}
              </button>
              <button onClick={() => deleteTodo(selectedTodo.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-200 hover:bg-red-100 transition-colors">
                <Trash2 className="h-4 w-4" />Löschen
              </button>
            </div>
            {desc && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-sm whitespace-pre-wrap">{desc}</p>
              </div>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {assignee && <span className="flex items-center gap-1"><User className="h-4 w-4" />{assignee.full_name}</span>}
              {selectedTodo.due_date && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />Fällig: {new Date(selectedTodo.due_date).toLocaleDateString("de-CH")}</span>}
              <span>Erstellt: {new Date(selectedTodo.created_at).toLocaleDateString("de-CH")}</span>
            </div>
          </CardContent>
        </Card>

        {/* Anhänge */}
        <Card className="bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Anhänge ({attachments.length})</h2>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-1" />{uploading ? "Hochladen..." : "Datei hochladen"}
              </Button>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif" onChange={uploadFile} className="hidden" />
            </div>
            <div className="space-y-2">
              {attachments.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Anhänge.</p>}
              {attachments.map((a) => {
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
      </div>
    );
  }

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
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("offen")} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filter === "offen" ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>
          Offen ({openCount})
        </button>
        <button onClick={() => setFilter("erledigt")} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filter === "erledigt" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-500 border-gray-200"}`}>
          <Archive className="h-3 w-3" />Archiv ({todos.length - openCount})
        </button>
        <span className="border-l border-gray-200 mx-1" />
        <select
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
          className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600"
        >
          <option value="">Alle Personen</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>

      {/* Todo List */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-white"><CardContent className="p-4"><div className="h-5 bg-gray-200 rounded w-1/2" /></CardContent></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-white border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><CheckSquare className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">{filter === "erledigt" ? "Archiv ist leer" : "Keine offenen Todos"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{filter === "offen" && !personFilter ? "Erstelle dein erstes Todo." : ""}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((todo) => {
            const assignee = (todo as unknown as { assignee: { full_name: string } | null }).assignee;
            const overdue = todo.status === "offen" && todo.due_date && new Date(todo.due_date) < new Date(new Date().toDateString());
            return (
              <Card key={todo.id} className={`transition-all cursor-pointer ${overdue ? "bg-red-100 border-red-400" : "bg-white"} ${todo.status === "erledigt" ? "opacity-60" : "hover:shadow-sm"}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button onClick={(e) => { e.stopPropagation(); toggleTodo(todo.id, todo.status); }} className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-all ${todo.status === "erledigt" ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-red-400"}`}>
                      {todo.status === "erledigt" && <Check className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1" onClick={() => openTodo(todo)}>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${todo.status === "erledigt" ? "line-through text-muted-foreground" : ""}`}>{todo.title}</span>
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${JOB_PRIORITY[todo.priority].color}`}>{JOB_PRIORITY[todo.priority].label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {todo.due_date && <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}><Calendar className="h-3 w-3" />{overdue ? "Überfällig: " : ""}{(() => { const [y,m,d] = todo.due_date!.split("-").map(Number); return new Date(y, m-1, d, 12).toLocaleDateString("de-CH"); })()}</span>}
                        {assignee && <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" />{assignee.full_name}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors shrink-0"><Trash2 className="h-4 w-4" /></button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
