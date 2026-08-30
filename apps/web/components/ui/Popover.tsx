"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
}

/** Lightweight, dependency-free popover — click trigger to open, click outside/Escape to close. */
export function Popover({ trigger, children, align = "start", className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        popRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleOpen() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + window.scrollY + 6,
        left: align === "end" ? rect.right + window.scrollX : rect.left + window.scrollX,
      });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen} className="inline-flex">
        {trigger}
      </div>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: align === "end" ? undefined : pos.left,
              right: align === "end" ? window.innerWidth - pos.left : undefined,
            }}
            className={cn(
              "z-50 animate-fade-in rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 shadow-2xl max-w-sm",
              className
            )}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}