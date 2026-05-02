/**
 * Client-side File-Validation. Vorher liefen Uploads ungeprüft an die API,
 * 50MB-Files wurden erst dort abgewiesen — Bandbreite verschwendet, User-
 * Feedback verspaetet.
 */

import { toast } from "sonner";

export const MAX_UPLOAD_SIZE_MB = 25;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/** Wirft Toast wenn das File zu gross ist und gibt false zurueck.
 *  true = OK, weiter machen. */
export function validateFileSize(file: File, maxMb: number = MAX_UPLOAD_SIZE_MB): boolean {
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    toast.error(`Datei zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${maxMb} MB.`);
    return false;
  }
  return true;
}

/** Validiert mehrere Files. Gibt das Array zurueck wenn alle OK, sonst null. */
export function validateFileList(files: FileList | File[], maxMb: number = MAX_UPLOAD_SIZE_MB): File[] | null {
  const arr = Array.from(files);
  for (const f of arr) {
    if (!validateFileSize(f, maxMb)) return null;
  }
  return arr;
}
