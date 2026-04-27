"use client";

import { Card, CardContent } from "@/components/ui/card";

export function EinstellungenLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gray-200" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
