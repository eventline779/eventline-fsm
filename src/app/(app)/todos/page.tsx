"use client";

/**
 * Todos — Liste, server-seitig gefiltert+paginiert (PAGE_SIZE 50).
 * Layout ist von Haus aus kompakt (~50px pro Zeile), das Skalierungs-
 * Problem war Daten-Loading: vorher voll geladen + JS-Filter+Sort. Bei
 * 1000+ Todos friert das ein. Jetzt: WHERE-Klauseln + ORDER BY in der DB,
 * Cursor-Pagination "Mehr laden".
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Todo, Profile } from "@/types";

type TodoPriority = "niedrig" | "normal" | "hoch" | "dringend";
const TODO_PRIORITY_COLOR: Record<TodoPriority, string> = {
  niedrig: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  hoch: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  dringend: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};
import {
  Plus, Check, CheckSquare, Calendar, User, Trash2,
  ArrowLeft, Upload, FileText, Image as ImageIcon, Download, Archive, ChevronDown, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/use-confirm";

interface TodoAttachment {
  name: string;
  path: string;
  uploaded_at: string;
}

const PAGE_SIZE = 50;

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [archiveCount, setArchiveCount] = useState(0);
  const [filter, setFilter] = useState<"offen" | "erledigt">("offen");
  const [personFilter, setPersonFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal" as TodoPriority, due_date: "", assigned_to: "" });
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [attachments, setAttachments] = useState<TodoAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const { confirm, ConfirmModalElement } = useConfirm();

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryIdRef = useRef(0);

  // Server-seitiger Filter+Sort. Sortierung: Faelligkeit aufsteigend (NULLs ans
  // Ende via order with nullsFirst:false). PostgREST: title-Suche per ilike.
  const buildQuery = useCallback((cursor: { sortKey: string; id: string } | null) => {
    let q = supabase
      .from("todos")
      .select("*, assignee:profiles!assigned_to(full_name)")
      .eq("status", filter);
    if (personFilter) q = q.eq("assigned_to", personFilter);
    const term = search.trim();
    if (term.length > 0) {
      const like = `%${term}%`;
      q = q.or(`title.ilike.${like},description.ilike.${like}`);
    }
    if (cursor !== null) {
      // Composite cursor — due_date kann null sein, daher ist das Sortier-
      // Kriterium kompliziert; wir paginieren via id-cursor (DESC) bei ORDER BY id.
      q = q.lt("id", cursor.id);
    }
    // Sortierung: Faelligkeit zuerst (asc, nulls last), dann id desc als Tiebreak/Cursor.
    return q
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);
  }, [supabase, filter, personFilter, search]);

  const loadTodos = useCallback(async () => {
    const myId = ++queryIdRef.current;
    setLoading(true);
    const { data } = await buildQuery(null);
    if (myId !== queryIdRef.current) return;
    if (data) {
      const rows = data as unknown as Todo[];
      setHasMore(rows.length > PAGE_SIZE);
      setTodos(rows.slice(0, PAGE_SIZE));
    }
    setLoading(false);
  }, [buildQuery]);

  // Counts kommen aus separaten Queries — entkoppelt vom geladenen Page-Chunk,
  // sodass die Anzeige "Offen (X) / Archiv (Y)" auch bei Pagination korrekt bleibt.
  const refreshCounts = useCallback(async () => {
    const [openRes, doneRes] = await Promise.all([
      supabase.from("todos").select("*", { count: "exact", head: true }).eq("status", "offen"),
      supabase.from("todos").select("*", { count: "exact", head: true }).eq("status", "erledigt"),
    ]);
    setOpenCount(openRes.count ?? 0);
    setArchiveCount(doneRes.count ?? 0);
  }, [supabase]);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("is_active", true).order("full_name")
      .then(({ data }) => { if (data) setProfiles(data as Profile[]); });
    refreshCounts();
  }, [refreshCounts, supabase]);

  // Filter/Suche/Person triggert Reload mit 250ms Debounce auf der Suche.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { loadTodos(); }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [loadTodos]);

  async function loadMore() {
    if (loadingMore || todos.length === 0) return;
    setLoadingMore(true);
    const last = todos[todos.length - 1];
    const { data } = await buildQuery({ sortKey: last.due_date ?? "", id: last.id });
    if (data) {
      const rows = data as unknown as Todo[];
      setHasMore(rows.length > PAGE_SIZE);
      setTodos((prev) => [...prev, ...rows.slice(0, PAGE_SIZE)]);
    }
    setLoadingMore(false);
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
    await Promise.all([loadTodos(), refreshCounts()]);
  }

  async function toggleTodo(id: string, currentStatus: string) {
    const newStatus = currentStatus === "offen" ? "erledigt" : "offen";
    await supabase.from("todos").update({ status: newStatus, completed_at: newStatus === "erledigt" ? new Date().toISOString() : null }).eq("id", id);
    if (selectedTodo?.id === id) {
      setSelectedTodo({ ...selectedTodo, status: newStatus as "offen" | "erledigt" });
    }
    await Promise.all([loadTodos(), refreshCounts()]);
  }

  async function deleteTodo(id: string) {
    const ok = await confirm({
      title: "Todo löschen?",
      confirmLabel: "Löschen",
      variant: "red",
    });
    if (!ok) return;
    if (attachments.length > 0) {
      await supabase.storage.from("documents").remove(attachments.map((a) => a.path));
    }
    await supabase.from("todos").delete().eq("id", id);
    setSelectedTodo(null);
    await Promise.all([loadTodos(), refreshCounts()]);
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
    const desc = data?.description || "";
    let parsed: { _text?: string; _attachments?: TodoAttachment[] } = {};
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

  const priorities: { value: TodoPriority; label: string }[] = [
    { value: "niedrig", label: "Niedrig" },
    { value: "normal", label: "Normal" },
    { value: "hoch", label: "Hoch" },
    { value: "dringend", label: "Dringend" },
  ];

  const hasFilter = !!search.trim() || !!personFilter;

  // Detail view
  if (selectedTodo) {
    const assignee = (selectedTodo as unknown as { assignee: { full_name: string } | null }).assignee;
    const desc = getDescription(selectedTodo);
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedTodo(null)} className="p-2 rounded-lg hover:bg-card transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className={`text-2xl font-bold tracking-tight ${selectedTodo.status === "erledigt" ? "line-through text-muted-foreground" : ""}`}>{selectedTodo.title}</h1>
              <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full capitalize ${TODO_PRIORITY_COLOR[selectedTodo.priority as TodoPriority] ?? TODO_PRIORITY_COLOR.normal}`}>{selectedTodo.priority}</span>
            </div>
          </div>
        </div>

        <Card className="bg-card">
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

        <Card className="bg-card">
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
        {ConfirmModalElement}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Todos</h1>
          <p className="text-sm text-muted-foreground mt-1">{openCount} offen · {archiveCount} archiviert</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="kasten kasten-red"
        >
          <Plus className="h-3.5 w-3.5" />Neues Todo
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card className="bg-card border-red-100">
          <CardContent className="p-6">
            <form onSubmit={addTodo} className="space-y-4">
              <Input placeholder="Was muss erledigt werden? *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-gray-50" required />
              <textarea placeholder="Details (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={2} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priorität</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TodoPriority })} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
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
                <button type="button" onClick={() => setShowForm(false)} className="kasten kasten-muted">Abbrechen</button>
                <button type="submit" disabled={!form.title} className="kasten kasten-red">Todo erstellen</button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Such- + Filter-Bar — gleiche UX wie /kunden */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Titel oder Beschreibung suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("offen")}
            className={filter === "offen" ? "kasten-active" : "kasten-toggle-off"}
          >
            Offen ({openCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("erledigt")}
            className={filter === "erledigt" ? "kasten-active" : "kasten-toggle-off"}
          >
            <Archive className="h-3 w-3" />
            Archiv ({archiveCount})
          </button>
          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="kasten-toggle-off"
          >
            <option value="">Alle Personen</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setSearch(""); setPersonFilter(""); }}
            className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Todo List */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4"><div className="h-5 bg-gray-200 rounded w-1/2" /></CardContent></Card>)}</div>
      ) : todos.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><CheckSquare className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">{filter === "erledigt" ? "Archiv ist leer" : hasFilter ? "Keine Treffer" : "Keine offenen Todos"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{filter === "offen" && !hasFilter ? "Erstelle dein erstes Todo." : ""}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => {
            const assignee = (todo as unknown as { assignee: { full_name: string } | null }).assignee;
            const overdue = todo.status === "offen" && todo.due_date && new Date(todo.due_date) < new Date(new Date().toDateString());
            return (
              <Card key={todo.id} className={`transition-all cursor-pointer ${overdue ? "bg-red-100 border-red-400" : "bg-card"} ${todo.status === "erledigt" ? "opacity-60" : "hover:shadow-sm"}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button onClick={(e) => { e.stopPropagation(); toggleTodo(todo.id, todo.status); }} className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-all ${todo.status === "erledigt" ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-red-400"}`}>
                      {todo.status === "erledigt" && <Check className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1" onClick={() => openTodo(todo)}>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${todo.status === "erledigt" ? "line-through text-muted-foreground" : ""}`}>{todo.title}</span>
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full capitalize ${TODO_PRIORITY_COLOR[todo.priority as TodoPriority] ?? TODO_PRIORITY_COLOR.normal}`}>{todo.priority}</span>
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
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="kasten kasten-muted"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {loadingMore ? "Lade…" : "Mehr laden"}
              </button>
            </div>
          )}
        </div>
      )}
      {ConfirmModalElement}
    </div>
  );
}
