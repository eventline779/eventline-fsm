"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

// viewBox 460:100 (Aspect 4.6:1). Hoehe wird aus der Breite abgeleitet.
const widths = {
  sm: 130,
  md: 180,
  lg: 240,
  xl: 320,
};

export function Logo({ size = "md", className }: LogoProps) {
  const w = widths[size];
  const h = Math.round((w * 100) / 460);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 460 100"
      width={w}
      height={h}
      className={`text-foreground ${className ?? ""}`}
      aria-label="EVENTLINE GmbH"
      role="img"
    >
      <text
        x="0"
        y="72"
        fontFamily="'Arial Black','Impact','Helvetica Neue',Helvetica,Arial,sans-serif"
        fontWeight={900}
        fontSize={72}
        letterSpacing={-3}
        fill="currentColor"
      >
        EVENTL
      </text>
      <rect x="263" y="22" width="20" height="50" fill="#E53935" />
      <text
        x="287"
        y="72"
        fontFamily="'Arial Black','Impact','Helvetica Neue',Helvetica,Arial,sans-serif"
        fontWeight={900}
        fontSize={72}
        letterSpacing={-3}
        fill="currentColor"
      >
        NE
      </text>
      <text
        x="335"
        y="94"
        fontFamily="'Arial Black','Impact','Helvetica Neue',Helvetica,Arial,sans-serif"
        fontWeight={900}
        fontSize={18}
        letterSpacing={0}
        fill="currentColor"
      >
        GmbH
      </text>
    </svg>
  );
}
