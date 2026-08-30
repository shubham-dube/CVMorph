"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tooltip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className={cn(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-[var(--radius-sm)] bg-surface-raised border border-border px-2 py-1 text-[11px] text-text shadow-lg z-50 animate-fade-in",
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}