import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Konsistenter Empty-State app-weit. Audit-Befund: 5+ Pages hatten je eigene
 * Variants (mal Icon mal nicht, mal h3 mal nicht). Diese Komponente fasst das
 * eine Standard-Pattern zusammen — Icon-Pad + h3 + Description + optional Action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
