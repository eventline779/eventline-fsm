// Speichert ein Form-Draft in sessionStorage, damit z.B. der Nutzer von einem Auftrags-
// Formular kurz nach /kunden/neu springen, einen neuen Kunden anlegen und danach mit
// allem schon Ausgefuellten zurueckkommen kann.
//
// Konvention: Key ist der Pfad, auf dem das Formular liegt (z.B. "/anfragen/neu" oder
// "/auftraege/<id>/bearbeiten"). So koennen mehrere Drafts parallel existieren.
//
// sessionStorage statt localStorage: ueberlebt Reloads, raeumt sich aber beim
// Schliessen des Tabs auf — kein Gefahr von uralten Drafts.

const KEY_PREFIX = "eventline-form-resume:";

function buildKey(returnPath: string): string {
  return KEY_PREFIX + returnPath;
}

export function saveFormDraft<T>(returnPath: string, state: T): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(buildKey(returnPath), JSON.stringify(state));
  } catch {
    // Storage voll oder deaktiviert — kein Drama, Draft geht halt verloren.
  }
}

export function popFormDraft<T>(returnPath: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(buildKey(returnPath));
    if (!raw) return null;
    sessionStorage.removeItem(buildKey(returnPath));
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
