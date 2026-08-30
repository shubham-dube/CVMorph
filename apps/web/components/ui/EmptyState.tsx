import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border py-16 px-6 text-center",
        className
      )}
    >
      {icon && <div className="text-text-faint">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        {description && <p className="text-sm text-text-muted mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}