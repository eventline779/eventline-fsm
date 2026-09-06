"use client";

/**
 * MobilePreviewFrame — Dev-Mode Mobile-Preview via iframe.
 *
 * Warum iframe: CSS @media-Queries reagieren auf den ECHTEN Viewport
 * des rendernden Frames. Wenn wir die App einfach in einen 375px-Container
 * scalen wuerden, sieht sie klein aus aber die Media-Queries greifen
 * weiterhin auf den 1920px-Viewport → falsche Layouts. Ein iframe hat
 * seinen eigenen Viewport → Tailwind sm:/md:/lg:-Breakpoints greifen
 * genau wie auf einem echten Handy.
 *
 * Session/Auth: iframe-src ist same-origin (die aktuelle URL). Cookies
 * werden automatisch mitgegeben → App im iframe ist eingeloggt wie normal.
 *
 * Rekursion: das ViewAsOverlay und der LiveBroadcastReceiver checken
 * window.self !== window.top → wenn sie im iframe laufen (embed-Kontext),
 * mounten sie nicht. So gibt es kein doppeltes Overlay im Preview.
 */

import { useEffect, useRef, useState } from "react";
import { X, Smartphone, RefreshCw } from "lucide-react";

interface Props {
  onClose: () => void;
}

const DEVICE_PRESETS = [
  { key: "iphone14", label: "iPhone 14 Pro", w: 393, h: 852 },
  { key: "iphonese", label: "iPhone SE", w: 375, h: 667 },
  { key: "pixel7", label: "Pixel 7", w: 412, h: 915 },
] as const;

export function MobilePreviewFrame({ onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<(typeof DEVICE_PRESETS)[number]["key"]>(
    "iphone14",
  );
  const [srcKey, setSrcKey] = useState(0);
  const [src, setSrc] = useState<string>("");

  // src beim Mount setzen — window ist SSR-nicht-verfuegbar, deshalb useEffect
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Query-Marker '?_mobile_preview=1' setzen. Der iframe-App-Kontext
      // liest den Marker (via searchParams) → ViewAsOverlay/Receiver
      // koennten damit granularer entscheiden. Fuer jetzt reicht der
      // window.top-Check.
      const u = new URL(window.location.href);
      u.searchParams.set("_mobile_preview", "1");
      setSrc(u.toString());
    }
  }, []);

  const dev = DEVICE_PRESETS.find((d) => d.key === device) ?? DEVICE_PRESETS[0];

  function reload() {
    setSrcKey((k) => k + 1);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        background: "color-mix(in oklab, #000 88%, transparent)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* Top-Bar mit Device-Auswahl + Reload + Close. Fixed am oberen
          Rand des Backdrops. */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          padding: "6px 8px 6px 12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <Smartphone style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>Mobile-Ansicht</span>
        <div
          style={{
            width: 1,
            height: 14,
            background: "var(--border)",
            margin: "0 4px",
          }}
        />
        {DEVICE_PRESETS.map((d) => {
          const active = d.key === device;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setDevice(d.key)}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 999,
                border: "none",
                background: active
                  ? "color-mix(in oklab, var(--accent) 15%, transparent)"
                  : "transparent",
                color: active ? "var(--accent)" : "var(--muted-foreground)",
                cursor: "pointer",
              }}
            >
              {d.label}
            </button>
          );
        })}
        <div
          style={{
            width: 1,
            height: 14,
            background: "var(--border)",
            margin: "0 4px",
          }}
        />
        <span style={{ fontSize: 10, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
          {dev.w}×{dev.h}
        </span>
        <button
          type="button"
          onClick={reload}
          title="Neu laden"
          style={{
            width: 24,
            height: 24,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "color-mix(in oklab, var(--foreground) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Zurück zur Desktop-Ansicht"
          style={{
            width: 24,
            height: 24,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "color-mix(in oklab, #dc2626 15%, transparent)";
            e.currentTarget.style.color = "#dc2626";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--foreground)";
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Handy-Rahmen. Dezenter Bezel + subtile Notch damit klar ist,
          das ist ein Handy. Der iframe darin ist der eigentliche Viewport. */}
      <div
        style={{
          width: dev.w + 20,
          height: dev.h + 20,
          maxWidth: "min(96vw, 480px)",
          maxHeight: "min(90vh, 940px)",
          background: "#111",
          borderRadius: 40,
          padding: 10,
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
          position: "relative",
        }}
      >
        {/* Notch */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 100,
            height: 22,
            background: "#000",
            borderRadius: 999,
            zIndex: 1,
          }}
        />
        <iframe
          key={srcKey}
          ref={iframeRef}
          src={src}
          title="Mobile Preview"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: 30,
            background: "var(--background)",
            display: "block",
          }}
        />
      </div>
    </div>
  );
}
