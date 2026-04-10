"use client";

import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "light" | "dark";
}

const sizes = {
  sm: { width: 120, height: 40 },
  md: { width: 160, height: 50 },
  lg: { width: 200, height: 63 },
  xl: { width: 280, height: 88 },
};

export function Logo({ size = "md", variant = "dark" }: LogoProps) {
  const s = sizes[size];
  // dark = schwarzes GmbH-Logo (für helle Hintergründe + PDF)
  // light = weisses/transparentes Logo (für dunkle Sidebar)
  const src = variant === "light" ? "/logo-light.png" : "/logo-gmbh.png";

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
