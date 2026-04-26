"use client";

import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * Optionaler Override. Default: das Logo wechselt automatisch zwischen
   * /logo-gmbh.png (Light-Mode) und /logo-light.png (Dark-Mode).
   * Setze diesen Prop nur wenn du den Theme-Mechanismus umgehen musst
   * (z.B. PDF-Export, der immer das schwarze Logo braucht).
   */
  variant?: "auto" | "light" | "dark";
}

const sizes = {
  sm: { width: 120, height: 40 },
  md: { width: 160, height: 50 },
  lg: { width: 200, height: 63 },
  xl: { width: 280, height: 88 },
};

// Dateinamen folgen "logo-<theme>.png" — also das Logo, das IM jeweiligen
// Theme angezeigt wird. logo-light.png = schwarzes Logo für Light-Mode,
// logo-dark.png = weisses Logo fuer Dark-Mode.
const SRC_FOR_LIGHT = "/logo-light.png";
const SRC_FOR_DARK = "/logo-dark.png";

export function Logo({ size = "md", variant = "auto" }: LogoProps) {
  const s = sizes[size];

  if (variant === "auto") {
    // Beide Logos rendern, eines per CSS pro Theme ausblenden — vermeidet
    // Hydration-Mismatch und braucht keinen useTheme-Hook.
    return (
      <>
        <Image
          src={SRC_FOR_LIGHT}
          alt="EVENTLINE GmbH"
          width={s.width}
          height={s.height}
          className="object-contain h-auto block dark:hidden"
          priority
        />
        <Image
          src={SRC_FOR_DARK}
          alt="EVENTLINE GmbH"
          width={s.width}
          height={s.height}
          className="object-contain h-auto hidden dark:block"
          priority
        />
      </>
    );
  }

  const src = variant === "light" ? SRC_FOR_LIGHT : SRC_FOR_DARK;
  return (
    <Image
      src={src}
      alt="EVENTLINE GmbH"
      width={s.width}
      height={s.height}
      className="object-contain h-auto"
      priority
    />
  );
}
