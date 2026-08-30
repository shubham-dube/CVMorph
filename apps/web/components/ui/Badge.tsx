import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const styles: Record<BadgeVariant, string> = {
  default: "bg-surface-hover text-text-muted",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-confidence-high-soft text-confidence-high",
  warning: "bg-confidence-medium-soft text-confidence-medium",
  danger: "bg-danger-soft text-danger",
  outline: "border border-border text-text-muted bg-transparent",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}