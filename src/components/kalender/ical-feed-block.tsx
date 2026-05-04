"use client";

/**
 * iCal-Feed-Block — gemeinsame Card fuer das Anzeigen + Kopieren der
 * persoenlichen Calendar-Feed-URL. Wird auf /kalender (fuer alle User) und
 * in /einstellungen → Integrationen (nur fuer Admins, dort als "Kalender
 * der Firma" weil Admins via Token-Filter eh alle Daten sehen) eingebunden.
 *
 * Lokalisiert nichts — die Card-Texte (title, description, scope) kommen
 * vom Caller damit derselbe Block einmal als "Mein Kalender" und einmal
 * als "Kalender der Firma" auftauchen kann.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  /** Card-Headline. */
  title: string;
  /** Erklaer-Text unter der Headline. */
  description: React.ReactNode;
}

export function IcalFeedBlock({ title, description }: Props) {
  const supabase = createClient();
  const [icalUrl, setIcalUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("calendar_feed_token")
        .eq("id", user.id)
        .maybeSingle();
      const token = profile?.calendar_feed_token;
      if (token) {
        setIcalUrl(`${window.location.origin}/api/calendar.ics?token=${token}`);
      }
    })();
  }, [supabase]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("URL kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  }

  return (
    <Card className="bg-card border-gray-100">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-red-500 flex items-center justify-center text-white font-bold shrink-0">
            G
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
              <br />
              <span className="text-amber-700 dark:text-amber-400">
                Diese URL enthält dein persönliches Token — nicht weitergeben.
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={icalUrl}
            onClick={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-lg border bg-muted/40 truncate focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="button"
            onClick={copy}
            disabled={!icalUrl}
            className={`kasten ${copied ? "kasten-green" : "kasten-blue"}`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
