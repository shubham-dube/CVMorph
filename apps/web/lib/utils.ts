import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely, resolving conflicts (last wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "May/2022" style display already comes from the API (duration_display) —
 * this is only for the rare client-side fallback (e.g. optimistic UI). */
export function formatMonthYear(yyyyMm: string | null): string {
  if (!yyyyMm) return "";
  const [y, m] = yyyyMm.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m}/${y}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}