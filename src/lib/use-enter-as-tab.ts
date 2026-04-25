"use client";

/**
 * Globaler Hook: Enter im Input/Select springt zum nächsten fokussierbaren
 * Element im selben Form, statt das Form zu submitten.
 *
 * Ausnahmen (Enter behält normales Verhalten):
 *   - <textarea>             → newline
 *   - <button>               → click
 *   - input[type=button|submit|checkbox|radio]
 *   - Wenn ein Element-eigener Handler bereits e.preventDefault() gerufen hat
 *     (z.B. Combobox-Komponenten, die Enter für "Vorschlag auswählen" nutzen)
 *
 * In einem `(app)/layout.tsx` einmal aufrufen — gilt dann app-weit.
 */

import { useEffect } from "react";

const NON_INTERCEPTED_INPUT_TYPES = new Set([
  "button",
  "submit",
  "checkbox",
  "radio",
  "image",
  "reset",
  "file",
]);

function isVisible(el: HTMLElement): boolean {
  return !!(el.offsetParent || el.getClientRects().length);
}

export function useEnterAsTab() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      // Custom-Komponente hat Enter schon gehandhabt (Combobox-Auswahl etc.)
      if (e.defaultPrevented) return;
      // Mod-Keys (Ctrl+Enter, Cmd+Enter, Shift+Enter) durchlassen
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;

      if (tag === "TEXTAREA" || tag === "BUTTON") return;
      if (tag === "INPUT") {
        const inputType = (target as HTMLInputElement).type;
        if (NON_INTERCEPTED_INPUT_TYPES.has(inputType)) return;
      } else if (tag !== "SELECT") {
        // andere Elemente (z.B. divs mit contentEditable) ignorieren wir hier
        return;
      }

      e.preventDefault();

      // Suche nächstes fokussierbares Element im selben Form (oder, falls keins,
      // im selben Document)
      const scope: Element = target.closest("form") ?? document.body;
      const focusables = Array.from(
        scope.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (el) =>
          !(el as HTMLInputElement).disabled &&
          el.tabIndex !== -1 &&
          isVisible(el)
      );

      const idx = focusables.indexOf(target);
      if (idx >= 0 && idx < focusables.length - 1) {
        focusables[idx + 1].focus();
      } else {
        // Letztes Feld: einfach blurren statt zu submitten
        target.blur();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
