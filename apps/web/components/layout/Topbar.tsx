"use client";

import { useState } from "react";
import { Moon, Sun, LogOut, ChevronDown, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

export function Topbar({ title }: { title?: string }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6 shrink-0">
      <h1 className="text-[15px] font-semibold text-text">{title}</h1>

      <div className="flex items-center gap-2">
        <Link href="/upload">
          <Button size="sm" variant="secondary">
            <UploadCloud className="h-3.5 w-3.5" />
            Upload CV
          </Button>
        </Link>

        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-hover hover:text-text transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-surface-hover transition-colors"
          >
            <Avatar name={user?.email ?? "?"} />
            <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-50 w-56 rounded-[var(--radius-md)] border border-border bg-surface-raised p-1.5 shadow-2xl animate-fade-in">
                <div className="px-2.5 py-2 border-b border-border mb-1">
                  <p className="text-[13px] font-medium text-text truncate">{user?.email}</p>
                  <p className="text-[11px] text-text-faint capitalize">{user?.role}</p>
                </div>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13px] text-text-muted hover:bg-surface-hover hover:text-text"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}