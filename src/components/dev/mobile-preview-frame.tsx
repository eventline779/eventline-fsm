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
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        backdropFilter: "blur(4px)",
        padding: 20,
      }}
    >
      {/* Handy-Rahmen. Dezenter Bezel + subtile Notch damit klar ist,
          das ist ein Handy. Der iframe darin ist der eigentliche Viewport. */}
      <div
        style={{
          width: dev.w + 20,
          height: dev.h + 20,
          maxWidth: "min(80vw, 480px)",
          maxHeight: "min(90vh, 940px)",
          background: "#111",
          borderRadius: 40,
          padding: 10,
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
          position: "relative",
          flexShrink: 0,
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

      {/* Sidebar mit Device-Auswahl + Reload + Close. Vertikal RECHTS
          neben dem Handy — beruehrt das Handy nicht, sauberer Look. */}
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 10,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          minWidth: 160,
          maxWidth: 200,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingBottom: 8,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Smartphone style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.02em" }}>
            Mobile-Ansicht
          </span>
        </div>

        {/* Device-Presets vertikal */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
              marginBottom: 2,
            }}
          >
            Gerät
          </span>
          {DEVICE_PRESETS.map((d) => {
            const active = d.key === device;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDevice(d.key)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid " + (active ? "color-mix(in oklab, var(--accent) 50%, transparent)" : "transparent"),
                  background: active
                    ? "color-mix(in oklab, var(--accent) 12%, transparent)"
                    : "transparent",
                  color: active ? "var(--accent)" : "var(--foreground)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background =
                      "color-mix(in oklab, var(--foreground) 6%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Aktuelle Aufloesung */}
        <div
          style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            fontVariantNumeric: "tabular-nums",
            textAlign: "center",
            padding: "4px 0",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {dev.w}×{dev.h}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            onClick={reload}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--foreground)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "color-mix(in oklab, var(--foreground) 6%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <RefreshCw style={{ width: 12, height: 12 }} />
            Neu laden
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid color-mix(in oklab, #dc2626 40%, transparent)",
              background: "color-mix(in oklab, #dc2626 8%, transparent)",
              color: "#dc2626",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "color-mix(in oklab, #dc2626 18%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "color-mix(in oklab, #dc2626 8%, transparent)";
            }}
          >
            <X style={{ width: 12, height: 12 }} />
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}
