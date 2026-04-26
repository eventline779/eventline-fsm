// Eine zentrale Stelle fuer die Optik der Auftragsnummer (INT-XXXXX).
// Wird ueberall verwendet wo eine job_number visuell angezeigt wird —
// damit eine Aenderung des Designs immer alle Stellen erreicht.
//
// Stil: brand-rot getoent via .tinted-red (matcht Status-Farben-System),
// mono + semibold fuer "wichtiger Identifier"-Charakter.

interface JobNumberProps {
  number: number | null | undefined;
  /** Default 'sm' (text-xs). 'md' fuer Detail-Header, 'lg' fuer Hero-Anzeige. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-sm px-2 py-0.5",
  lg: "text-base px-2.5 py-1",
};

export function JobNumber({ number, size = "sm", className = "" }: JobNumberProps) {
  if (!number) return null;
  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded tinted-red ${sizeClasses[size]} ${className}`}
    >
      INT-{number}
    </span>
  );
}
