"use client";

import { Card, CardContent } from "@/components/ui/card";
import { X, ArrowRight } from "lucide-react";
import type { VertriebKategorie } from "@/types";
import { KATEGORIE_OPTIONS } from "@/app/(app)/vertrieb/constants";

interface Props {
  onPick: (kategorie: VertriebKategorie) => void;
  onClose: () => void;
}

export function CategoryPicker({ onPick, onClose }: Props) {
  return (
    <Card className="bg-card border-red-100">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Was für ein Lead?</h3>
          <button type="button" onClick={onClose} className="icon-btn icon-btn-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3">
          {KATEGORIE_OPTIONS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.value}
                type="button"
                onClick={() => onPick(k.value)}
                className="kasten kasten-red w-full p-4 gap-4 justify-start text-left text-sm"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${k.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{k.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {k.value === "verwaltung" ? "Verwaltungen, Immobilien, WEG-Anfragen" : "Sommerfeste, Jahresanlässe, Firmenevents"}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0" />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
