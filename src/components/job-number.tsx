// Eine zentrale Stelle fuer die Optik der Auftragsnummer (INT-XXXXX).
// Wird ueberall verwendet wo eine job_number visuell angezeigt wird —
// damit eine Aenderung des Designs immer alle Stellen erreicht.
//
// Stil: mono + semibold, gleiche Textfarbe wie der Auftragstitel — dezent
// hervorgehoben durch die Schriftart (Mono-Identifier-Charakter), nicht durch
// Farbe oder Hintergrund.

interface JobNumberProps {
  number: number | null | undefined;
  /** Default 'sm' (text-xs). 'md' fuer Detail-Header, 'lg' fuer Hero-Anzeige. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function JobNumber({ number, size = "sm", className = "" }: JobNumberProps) {
  if (!number) return null;
  return (
    <span className={`font-mono font-semibold ${sizeClasses[size]} ${className}`}>
      INT-{number}
    </span>
  );
}
