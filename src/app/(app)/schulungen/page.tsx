"use client";

import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function SchulungenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schulungen</h1>
        <p className="text-sm text-muted-foreground mt-1">Schulungen und Weiterbildungen</p>
      </div>

      <Card className="bg-white border-dashed">
        <CardContent className="py-20 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <GraduationCap className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="font-semibold text-lg">Kommt bald</h3>
          <p className="text-sm text-muted-foreground mt-1">Hier werden Schulungen und Weiterbildungen verwaltet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
