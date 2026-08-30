import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 h-9 text-sm text-text",
        "placeholder:text-text-faint",
        "focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none transition-colors",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 py-2 text-sm text-text leading-relaxed",
        "placeholder:text-text-faint resize-y min-h-[72px]",
        "focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none transition-colors",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";