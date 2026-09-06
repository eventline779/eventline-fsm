"use client";

/**
 * TodoDetail — die alte In-Page-Detail-View, unveraendert im Verhalten.
 * Extrahiert aus der monolithischen todos/page.tsx damit die Liste-Ansicht
 * ohne das ganze Anhang-Handling-Geraffel kleiner bleibt.
 *
 * Klein-Aenderungen gegenueber alt:
 *   - Faelligkeit + Assignee sind hier jetzt inline-editierbar (DatePopover
 *     + AssigneePopover), damit "Faelligkeit aendern" nicht mehr nur ueber
 *     die Row-Popover-Chips oder die DB moeglich ist. Der Pain-Point war:
 *     "im Detail gibt es kein Edit-Form" — jetzt gibt es Chip-Editing.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateFileSize } from "@/lib/file-upload";
import { TOAST } from "@/lib/messages";
import { useConfirm } from "@/components/ui/use-confirm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PdfPopup } from "@/components/pdf-popup";
import { ArrowLeft } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { DatePopover } from "./date-popover";
import { relativeDueLabel } from "@/lib/relative-date";
import type { Todo, Profile } from "@/types";
import {
  Check, Calendar, User as UserIcon, Trash2, Upload, FileText, Image as ImageIcon,
  Download, Eye, Bell, RotateCcw, AlertCircle,
} from "lucide-react";

interface TodoAttachment {
  id: string;
  todo_id: string;
  name: string;
  path: string;
  uploaded_at: string;
}

/** Nur die Todo-Felder + assignee-Embed die die Detail-View braucht. */
export type TodoDetailData = Omit<Todo, "assignee"> & {
  assignee?: { full_name: string } | null;
};

interface Props {
  supabase: SupabaseClient;
  todo: TodoDetailData;
  profiles: Profile[];
  canEdit: boolean;
  canRemind: boolean;
  reminded: boolean;
  onBack: () => void;
  onToggleComplete: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRestore: () => Promise<void>;
  onRemind: () => Promise<void>;
  onDueChange: (iso: string | null) => Promise<void>;
  onAssigneeChange: (id: string) => Promise<void>;
  onAttachmentsChanged?: () => void;
}

/* Portal-Popover fuer Assignee (dupliziert aus todo-row damit Detail
   nicht die Row importieren muss — beides sind ~30 Zeilen). */
function AssigneePopover({
  value, options, onChange, children,
}: {
  value: string;
  options: Profile[];
  onChange: (id: string) => void;
  children: (opts: { open: () => void; isOpen: boolean }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (!open) return;
    function measure() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 280;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left, width });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const popover = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      ref={popRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
      className="z-[1200] rounded-xl border border-border bg-popover shadow-lg p-2"
    >
      <SearchableSelect
        value={value}
        onChange={(id) => { onChange(id); setOpen(false); }}
        items={options.map((p) => ({ id: p.id, label: p.full_name }))}
        clearable={false}
        placeholder="Person auswaehlen ..."
      />
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div ref={anchorRef} className="inline-flex">
        {children({ open: () => setOpen((o) => !o), isOpen: open })}
      </div>
      {popover}
    </>
  );
}

export function TodoDetail({
  supabase, todo, profiles, canEdit, canRemind, reminded,
  onBack, onToggleComplete, onDelete, onRestore, onRemind,
  onDueChange, onAssigneeChange, onAttachmentsChanged,
}: Props) {
  const [attachments, setAttachments] = useState<TodoAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmModalElement } = useConfirm();

  useEffect(() => {
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id]);

  async function loadAttachments() {
    const { data } = await supabase
      .from("todo_attachments").select("*")
      .eq("todo_id", todo.id)
      .order("uploaded_at", { ascending: true });
    setAttachments((data as TodoAttachment[]) ?? []);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateFileSize(file)) return;
    setUploading(true);
    try {
      const path = `todos/${todo.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
      if (upErr) { TOAST.uploadError(upErr.message); return; }
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("todo_attachments").insert({
        todo_id: todo.id,
        name: file.name,
        path,
        uploaded_by: user?.id,
      });
      if (insErr) {
        await supabase.storage.from("documents").remove([path]);
        TOAST.uploadError(insErr.message);
        return;
      }
      await loadAttachments();
      onAttachmentsChanged?.();
      toast.success("Datei hochgeladen");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function deleteAttachment(att: TodoAttachment) {
    const ok = await confirm({
      title: "Anhang loeschen?",
      message: `"${att.name}" wird unwiderruflich entfernt.`,
      confirmLabel: "Loeschen",
      variant: "red",
    });
    if (!ok) return;
    await supabase.storage.from("documents").remove([att.path]);
    await supabase.from("todo_attachments").delete().eq("id", att.id);
    await loadAttachments();
    onAttachmentsChanged?.();
    toast.success("Datei geloescht");
  }

  async function getSignedUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { toast.error("Datei nicht verfuegbar"); return null; }
    return data.signedUrl;
  }
  async function previewFile(path: string, filename: string) {
    const url = await getSignedUrl(path);
    if (url) setPreviewDoc({ url, title: filename });
  }
  async function downloadFile(path: string, filename: string) {
    const url = await getSignedUrl(path);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }

  const isDeleted = !!todo.deleted_at;
  const isOpen = todo.status === "offen" && !isDeleted;
  const dueMeta = todo.due_date ? relativeDueLabel(todo.due_date) : null;
  const overdue = isOpen && dueMeta?.overdue === true;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        {/* Lokaler Back-Button (nicht /components/ui/back-button) — die Detail-
            View lebt auf derselben URL wie die Liste, wir wollen also nur die
            Selektion aufheben, nicht in der Browser-History zuruecknavigieren. */}
        <button
          type="button"
          aria-label="Zurueck zur Liste"
          onClick={onBack}
          className="p-2 rounded-lg shrink-0 border border-border bg-card md:border-transparent md:bg-transparent hover:bg-foreground/5 dark:hover:bg-foreground/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className={`text-2xl font-bold tracking-tight ${(!isOpen) ? "line-through text-muted-foreground" : ""}`}>
              {todo.title}
            </h1>
            {isDeleted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                <Trash2 className="h-3 w-3" />Geloescht
              </span>
            )}
            {!isDeleted && todo.priority === "dringend" && todo.status === "offen" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                <AlertCircle className="h-3 w-3" />Dringend
              </span>
            )}
          </div>
        </div>
      </div>

      <Card className="bg-card">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isDeleted ? (
              <button onClick={onRestore} className="kasten kasten-muted">
                <RotateCcw className="h-3.5 w-3.5" />Wiederherstellen
              </button>
            ) : todo.status === "offen" ? (
              <button onClick={onToggleComplete} className="kasten kasten-green">
                <Check className="h-3.5 w-3.5" />Abschliessen
              </button>
            ) : (
              <button onClick={onToggleComplete} className="kasten kasten-muted">
                Wieder oeffnen
              </button>
            )}
            {!isDeleted && todo.status === "offen" && canRemind && todo.assigned_to && (
              <button
                onClick={onRemind}
                disabled={reminded}
                className="kasten kasten-blue"
              >
                <Bell className="h-3.5 w-3.5" />
                {reminded ? "Erinnerung gesendet" : "Erinnern"}
              </button>
            )}
            {!isDeleted && todo.status === "offen" && (
              <button onClick={onDelete} className="kasten kasten-red">
                <Trash2 className="h-3.5 w-3.5" />Loeschen
              </button>
            )}
          </div>

          {todo.description && (
            <div className="p-3 rounded-xl bg-muted/40 border border-border">
              <p className="text-sm whitespace-pre-wrap">{todo.description}</p>
            </div>
          )}

          {/* Metadaten-Zeile mit inline-editierbaren Chips */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {isOpen && canEdit ? (
              <AssigneePopover
                value={todo.assigned_to ?? ""}
                options={profiles}
                onChange={(id) => { if (id) onAssigneeChange(id); }}
              >
                {({ open, isOpen: popOpen }) => (
                  <button
                    type="button"
                    onClick={open}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                      popOpen ? "bg-foreground/[0.08] text-foreground" : "hover:bg-foreground/[0.06]"
                    }`}
                  >
                    <UserIcon className="h-4 w-4" />{todo.assignee?.full_name ?? "Nicht zugewiesen"}
                  </button>
                )}
              </AssigneePopover>
            ) : (
              todo.assignee && <span className="flex items-center gap-1"><UserIcon className="h-4 w-4" />{todo.assignee.full_name}</span>
            )}

            {isOpen && canEdit ? (
              <DatePopover value={todo.due_date} onChange={onDueChange}>
                {({ open, isOpen: popOpen }) => (
                  <button
                    type="button"
                    onClick={open}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                      popOpen
                        ? "bg-foreground/[0.08] text-foreground"
                        : overdue
                          ? "text-red-600 dark:text-red-400 font-medium hover:bg-red-500/10"
                          : "hover:bg-foreground/[0.06]"
                    }`}
                  >
                    <Calendar className="h-4 w-4" />
                    {dueMeta ? `Faellig: ${dueMeta.label}` : "Faelligkeit setzen"}
                  </button>
                )}
              </DatePopover>
            ) : (
              todo.due_date && (
                <span className={`flex items-center gap-1 ${overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                  <Calendar className="h-4 w-4" />
                  Faellig: {new Date(todo.due_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}
                </span>
              )
            )}

            <span>Erstellt: {new Date(todo.created_at).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}</span>
            {todo.completed_at && (
              <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />Abgeschlossen: {new Date(todo.completed_at).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />Anhaenge ({attachments.length})
            </h2>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading || isDeleted}>
              <Upload className="h-4 w-4 mr-1" />{uploading ? "Hochladen..." : "Datei hochladen"}
            </Button>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif" onChange={uploadFile} className="hidden" />
          </div>
          <div className="space-y-2">
            {attachments.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Anhaenge.</p>}
            {attachments.map((a) => {
              const isImage = /\.(jpg|jpeg|png|gif)$/i.test(a.name);
              return (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
                  <button onClick={() => previewFile(a.path, a.name)} className="flex items-center gap-3 min-w-0 flex-1 text-left hover:text-foreground transition-colors">
                    {isImage ? <ImageIcon className="h-5 w-5 text-blue-500 shrink-0" /> : <FileText className="h-5 w-5 text-red-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.uploaded_at).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button onClick={() => previewFile(a.path, a.name)} className="icon-btn icon-btn-blue" data-tooltip="Vorschau">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button onClick={() => downloadFile(a.path, a.name)} className="icon-btn icon-btn-muted" data-tooltip="Herunterladen">
                      <Download className="h-4 w-4" />
                    </button>
                    {isOpen && (
                      <button onClick={() => deleteAttachment(a)} className="icon-btn icon-btn-red" data-tooltip="Loeschen">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {ConfirmModalElement}
      {previewDoc && (
        <PdfPopup url={previewDoc.url} title={previewDoc.title} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  );
}
