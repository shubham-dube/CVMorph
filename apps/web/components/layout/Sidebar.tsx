"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  UploadCloud,
  FileStack,
  LayoutTemplate,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/branding";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/upload", label: "Upload CV", icon: UploadCloud },
  { href: "/generations", label: "Generations", icon: FileStack },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface/50">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 h-14 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-accent text-[color:var(--accent-contrast)]">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-text">{BRAND.name}</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-accent-soft text-accent-strong"
                  : "text-text-muted hover:bg-surface-hover hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Settings — bottom of sidebar, visible to all, admin-badge shown */}
      <div className="px-3 pb-4 border-t border-border pt-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-accent-soft text-accent-strong"
              : "text-text-muted hover:bg-surface-hover hover:text-text"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
          {user?.role === "admin" && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-accent bg-accent-soft rounded-full px-1.5 py-0.5">
              Admin
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}