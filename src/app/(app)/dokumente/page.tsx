"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import type { Document } from "@/types";
import { FolderOpen, File, FileText, FileImage, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function DokumentePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const supabase = createClient();

  useEffect(() => { loadDocuments(); }, []);

  async function loadDocuments() {
    const { data } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
    if (data) setDocuments(data as Document[]);
    setLoading(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    for (const file of Array.from(files)) {
      const path = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
      if (uploadError) { toast.error("Upload fehlgeschlagen: " + uploadError.message); continue; }

      await supabase.from("documents").insert({
        name: file.name,
        storage_path: path,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
      });
    }

    toast.success("Dokument(e) hochgeladen");
    loadDocuments();
    setUploading(false);
    e.target.value = "";
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getIcon(mime: string | null) {
    if (mime?.startsWith("image/")) return <FileImage className="h-5 w-5" />;
    if (mime?.includes("pdf")) return <FileText className="h-5 w-5" />;
    return <File className="h-5 w-5" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dokumente</h1>
          <p className="text-sm text-muted-foreground mt-1">{documents.length} Dateien</p>
        </div>
        <div>
          <input type="file" id="fileUpload" multiple className="hidden" onChange={handleUpload} />
          <Button onClick={() => document.getElementById("fileUpload")?.click()} disabled={uploading} className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
            <Upload className="h-4 w-4 mr-2" />{uploading ? "Laden..." : "Hochladen"}
          </Button>
        </div>
      </div>

      {/* Drop Zone */}
      <Card className="bg-white border-2 border-dashed border-gray-200 hover:border-red-300 transition-colors cursor-pointer" onClick={() => document.getElementById("fileUpload")?.click()}>
        <CardContent className="py-10 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Upload className="h-7 w-7 text-gray-400" /></div>
          <p className="font-medium text-gray-700">Dateien hier hochladen</p>
          <p className="text-sm text-muted-foreground mt-1">Klicken oder Dateien auswählen</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-white"><CardContent className="p-4"><div className="h-5 bg-gray-200 rounded w-1/3" /></CardContent></Card>)}</div>
      ) : documents.length === 0 ? (
        <Card className="bg-white border-dashed">
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><FolderOpen className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">Noch keine Dokumente</h3>
            <p className="text-sm text-muted-foreground mt-1">Lade dein erstes Dokument hoch.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="bg-white hover:shadow-sm transition-all">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-500">{getIcon(doc.mime_type)}</div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm truncate">{doc.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString("de-CH")}</span>
                    </div>
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
