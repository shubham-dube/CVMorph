"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  FileStack,
  ChevronLeft,
  ChevronRight,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { generationsApi } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import type { GenerationResponse } from "@/lib/types";

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<
  GenerationResponse["status"],
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-text-muted",
    bg: "bg-surface-raised border-border",
  },
  rendering: {
    label: "Rendering",
    icon: Loader2,
    color: "text-confidence-medium",
    bg: "bg-confidence-medium-soft border-confidence-medium/30",
  },
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    color: "text-confidence-high",
    bg: "bg-confidence-high-soft border-confidence-high/30",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-danger",
    bg: "bg-danger-soft border-danger/30",
  },
};

function StatusBadge({ status }: { status: GenerationResponse["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cfg.color} ${cfg.bg}`}
    >
      <Icon
        className={`h-3 w-3 ${status === "rendering" ? "animate-spin" : ""}`}
      />
      {cfg.label}
    </span>
  );
}

export default function GenerationsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["generations", page],
    queryFn: () => generationsApi.list({ page, pageSize: PAGE_SIZE }),
    // Auto-refresh if any generation is still in progress
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (!items) return false;
      const hasActive = items.some((g) => g.status === "pending" || g.status === "rendering");
      return hasActive ? 3000 : false;
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <Topbar title="Generations" />
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-text-muted">
            {data ? `${data.total} generation${data.total === 1 ? "" : "s"}` : ""}
          </p>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-md)]" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title="Couldn't load generations"
            description="Check that the API is running and reachable, then try again."
          />
        )}

        {data && data.items.length === 0 && (
          <EmptyState
            icon={<FileStack className="h-8 w-8" />}
            title="No generations yet"
            description="Approve a candidate profile and generate their formatted CV to see it here."
            action={
              <Link href="/candidates">
                <Button size="sm">View candidates</Button>
              </Link>
            }
          />
        )}

        {data && data.items.length > 0 && (
          <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_140px_160px_100px_48px] gap-3 px-4 py-2.5 bg-surface-raised border-b border-border text-[11px] font-semibold uppercase tracking-wide text-text-faint">
              <span>Candidate</span>
              <span>Status</span>
              <span>Created</span>
              <span>Template</span>
              <span />
            </div>

            {data.items.map((gen, i) => (
              <Link
                key={gen.id}
                href={`/generations/${gen.id}`}
                className={`grid grid-cols-[1fr_140px_160px_100px_48px] gap-3 items-center px-4 py-3.5 hover:bg-surface-hover transition-colors ${
                  i !== data.items.length - 1 ? "border-b border-border" : ""
                }`}
              >
                {/* Candidate id as fallback — ideally we'd batch-fetch names */}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text truncate font-mono">
                    {gen.candidate_id.split("-")[0]}…
                  </p>
                  <p className="text-[11px] text-text-faint mt-0.5">gen/{gen.id.split("-")[0]}…</p>
                </div>

                <StatusBadge status={gen.status} />

                <span className="text-xs text-text-muted">{formatDateTime(gen.created_at)}</span>

                <span className="text-xs text-text-faint font-mono truncate">
                  {gen.template_id.split("-")[0]}…
                </span>

                {gen.status === "complete" && gen.output_document_url ? (
                  <a
                    href={gen.output_document_url}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent hover:bg-accent hover:text-[color:var(--accent-contrast)] transition-colors"
                    title="Download CV"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span />
                )}
              </Link>
            ))}
          </div>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-5">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="text-xs text-text-muted font-mono">
              Page {page} of {totalPages}
            </span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
