"use client";

import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  /** Nutzt 100% der Container-Breite; Aspect-Ratio bleibt via CSS erhalten. */
  fillWidth?: boolean;
  className?: string;
}

// Native PNG-Aspect 800:185 (~ 4.32:1). Hoehe wird aus der Breite abgeleitet.
const widths = {
  sm: 130,
  md: 180,
  lg: 240,
  xl: 320,
};

const SRC_LIGHT_MODE = "/logo-gmbh-black.png"; // schwarzes Logo + roter I
const SRC_DARK_MODE = "/logo-gmbh.png"; // weisses Logo + roter I

export function Logo({ size = "md", fillWidth = false, className }: LogoProps) {
  if (fillWidth) {
    // Volle Container-Breite, Aspect-Ratio via CSS erhalten.
    return (
      <span className={`block w-full ${className ?? ""}`}>
        <Image
          src={SRC_LIGHT_MODE}
          alt="EVENTLINE GmbH"
          width={800}
          height={185}
          className="w-full h-auto block dark:hidden"
          priority
        />
        <Image
          src={SRC_DARK_MODE}
          alt="EVENTLINE GmbH"
          width={800}
          height={185}
          className="w-full h-auto hidden dark:block"
          priority
        />
      </span>
    );
  }
  const w = widths[size];
  const h = Math.round((w * 185) / 800);
  return (
    <span className={`inline-block ${className ?? ""}`} style={{ width: w, height: h }}>
      <Image
        src={SRC_LIGHT_MODE}
        alt="EVENTLINE GmbH"
        width={w}
        height={h}
        className="object-contain h-auto block dark:hidden"
        priority
      />
      <Image
        src={SRC_DARK_MODE}
        alt="EVENTLINE GmbH"
        width={w}
        height={h}
        className="object-contain h-auto hidden dark:block"
        priority
      />
    </span>
  );
}
