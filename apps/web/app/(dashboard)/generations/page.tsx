"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  FileStack,
  ChevronLeft,
  ChevronRight,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  FileText,
  Eye,
  Layers,
  ExternalLink,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { generationsApi } from "@/lib/api-client";
import { formatDateTime, cn } from "@/lib/utils";
import type { GenerationResponse } from "@/lib/types";

const PAGE_SIZE = 15;

const STATUS_FILTERS = [
  { key: "all", label: "All Exports" },
  { key: "complete", label: "Completed" },
  { key: "rendering", label: "Rendering" },
  { key: "failed", label: "Failed" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

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
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  complete: {
    label: "Completed",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-danger",
    bg: "bg-danger-soft border-danger/30",
  },
};

function StatusBadge({ status }: { status: GenerationResponse["status"] }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        cfg.color,
        cfg.bg
      )}
    >
      <Icon
        className={cn("h-3 w-3", status === "rendering" && "animate-spin")}
      />
      {cfg.label}
    </span>
  );
}

export default function GenerationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["generations", page, search, statusFilter],
    queryFn: () =>
      generationsApi.list({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (!items) return false;
      const hasActive = items.some((g) => g.status === "pending" || g.status === "rendering");
      return hasActive ? 3000 : false;
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const startItem = data && data.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endItem = data ? Math.min(page * PAGE_SIZE, data.total) : 0;

  return (
    <>
      <Topbar title="Generated Resumes" />
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text">Resume Exports & Generations</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Browse, preview, and download compiled candidate resumes across all templates and profiles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs h-8"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Link href="/upload">
              <Button size="sm" className="text-xs h-8">
                Generate New Resume
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3 rounded-[var(--radius-lg)] border border-border shadow-2xs">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint" />
            <Input
              placeholder="Search candidate name, profile, or template..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 text-xs h-8.5 bg-bg"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-bg p-1 rounded-[var(--radius-md)] border border-border/80 self-start sm:self-auto overflow-x-auto">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => {
                    setStatusFilter(f.key);
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-sm)] transition-all cursor-pointer whitespace-nowrap",
                    active
                      ? "bg-surface text-text shadow-2xs font-bold border border-border"
                      : "text-text-muted hover:text-text hover:bg-surface-hover/50"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-lg)]" />
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <EmptyState
            title="Couldn't load generations"
            description="Check that the API is running and reachable, then try again."
          />
        )}

        {/* Empty State */}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<FileStack className="h-8 w-8 text-text-faint" />}
            title={search || statusFilter !== "all" ? "No resumes match your filters" : "No resumes generated yet"}
            description={
              search || statusFilter !== "all"
                ? "Try adjusting your search terms or status filter."
                : "Open any candidate's profile and click 'Generate Resume' to create a formatted document."
            }
            action={
              !search && statusFilter === "all" ? (
                <Link href="/candidates">
                  <Button size="sm">Go to Candidates</Button>
                </Link>
              ) : undefined
            }
          />
        )}

        {/* Generations Table List */}
        {data && data.items.length > 0 && (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface overflow-hidden shadow-2xs">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-surface-raised border-b border-border text-[11px] font-bold uppercase tracking-wider text-text-faint">
              <span className="col-span-5 sm:col-span-4">Candidate & Profile</span>
              <span className="col-span-3 hidden sm:block">Template</span>
              <span className="col-span-3 sm:col-span-2">Status</span>
              <span className="col-span-2 hidden md:block">Created</span>
              <span className="col-span-4 sm:col-span-3 md:col-span-1 text-right">Actions</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/60">
              {data.items.map((gen) => {
                const candidateName = gen.candidate_name || `Candidate #${gen.candidate_id.slice(0, 8)}`;
                const profileTitle = gen.profile_title || "Primary Profile";
                const templateName = gen.template_name || `Template #${gen.template_id.slice(0, 8)}`;
                const pdfUrl = gen.output_pdf_download_url || gen.output_pdf_url;
                const docxUrl = gen.output_document_url;

                return (
                  <div
                    key={gen.id}
                    className="grid grid-cols-12 gap-3 items-center px-4 py-3.5 hover:bg-surface-hover/70 transition-colors"
                  >
                    {/* Candidate & Profile Info */}
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
                      <Avatar name={candidateName} />
                      <div className="min-w-0">
                        <Link
                          href={`/candidates/${gen.candidate_id}/review?profileId=${gen.profile_id || ""}`}
                          className="text-xs font-semibold text-text hover:text-accent truncate block"
                          title={candidateName}
                        >
                          {candidateName}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] text-text-muted font-medium">
                            <Layers className="h-3 w-3 text-accent/80 shrink-0" />
                            <span className="truncate max-w-[140px]">{profileTitle}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Template */}
                    <div className="col-span-3 hidden sm:flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded bg-accent-soft text-accent flex items-center justify-center shrink-0">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium text-text truncate" title={templateName}>
                        {templateName}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-span-3 sm:col-span-2">
                      <StatusBadge status={gen.status} />
                    </div>

                    {/* Created Date */}
                    <div className="col-span-2 hidden md:block">
                      <span className="text-[11px] text-text-muted">
                        {formatDateTime(gen.created_at)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-4 sm:col-span-3 md:col-span-1 flex items-center justify-end gap-1.5">
                      {gen.status === "complete" ? (
                        <>
                          {pdfUrl && (
                            <a
                              href={pdfUrl}
                              download={`${candidateName.replace(/\s+/g, "_")}_Resume.pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-7 px-2 rounded-[var(--radius-sm)] bg-accent-soft text-accent hover:bg-accent hover:text-white transition-colors text-xs font-semibold inline-flex items-center gap-1"
                              title="Download Formatted PDF"
                            >
                              <Download className="h-3 w-3" />
                              <span>PDF</span>
                            </a>
                          )}
                          {docxUrl && (
                            <a
                              href={docxUrl}
                              download={`${candidateName.replace(/\s+/g, "_")}_Resume.docx`}
                              className="h-7 px-2 rounded-[var(--radius-sm)] bg-bg-elevated text-text-muted hover:text-text hover:bg-surface-hover transition-colors text-xs font-semibold inline-flex items-center gap-1 border border-border"
                              title="Download Word Document (DOCX)"
                            >
                              <Download className="h-3 w-3" />
                              <span>DOCX</span>
                            </a>
                          )}
                        </>
                      ) : (
                        <Link
                          href={`/generations/${gen.id}`}
                          className="text-xs text-text-muted hover:text-accent font-medium inline-flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-surface-raised border-t border-border">
              <p className="text-xs text-text-muted">
                Showing <span className="font-semibold text-text">{startItem}–{endItem}</span> of{" "}
                <span className="font-semibold text-text">{data.total}</span> resumes
              </p>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs h-7 px-2.5"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                </Button>
                <span className="text-xs text-text-faint font-medium px-1">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs h-7 px-2.5"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
