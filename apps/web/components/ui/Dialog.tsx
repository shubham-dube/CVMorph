"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-surface-raised shadow-2xl animate-fade-in",
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold text-text">{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted mt-1">{children}</p>;
}