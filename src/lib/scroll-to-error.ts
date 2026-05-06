// Scroll to the first invalid form field after a failed submit.
// Pattern in long forms (lead-form, rapport-form-modal): toast.error()
// only flashes briefly, but the actual problematic field can be off-screen.
// Scrollt das erste Element mit aria-invalid="true" oder einem konkreten
// id-Match in den Viewport.
//
// Usage:
//   if (!form.title.trim()) {
//     toast.error("Titel fehlt");
//     scrollToError("title");  // optional: id of the field
//     return;
//   }

export function scrollToError(fieldId?: string) {
  if (typeof window === "undefined") return;

  // 1. Wenn fieldId angegeben: dorthin scrollen + Fokus.
  if (fieldId) {
    const el = document.getElementById(fieldId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Focus, falls editierbares Element.
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        // Nach Scroll-Animation fokussieren (sonst bricht der Scroll ab).
        setTimeout(() => el.focus(), 300);
      }
      return;
    }
  }

  // 2. Sonst: erstes aria-invalid="true" Element suchen.
  const invalid = document.querySelector('[aria-invalid="true"]');
  if (invalid) {
    invalid.scrollIntoView({ behavior: "smooth", block: "center" });
    if (invalid instanceof HTMLElement) {
      setTimeout(() => invalid.focus?.(), 300);
    }
  }
}
