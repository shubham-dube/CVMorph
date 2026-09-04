"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Users,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { candidatesApi } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 15;

export default function CandidatesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["candidates", search, page],
    queryFn: () => candidatesApi.list({ search: search || undefined, page, pageSize: PAGE_SIZE }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <Topbar title="Candidates" />
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text">Candidate Directory</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Review extracted candidate profiles and manage formatting workflows.
            </p>
          </div>
          <Link href="/upload" className="self-start sm:self-auto">
            <Button size="sm">
              <UploadCloud className="h-3.5 w-3.5" /> Upload CV
            </Button>
          </Link>
        </div>

        {/* Search bar */}
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint" />
          <Input
            placeholder="Search by candidate name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8 text-xs"
          />
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-lg)]" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title="Couldn't load candidates"
            description="Check that the API is running and reachable, then try again."
          />
        )}

        {data && data.items.length === 0 && (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={search ? "No candidates match your search" : "No candidates yet"}
            description={
              search
                ? "Try a different name or clear the search."
                : "Upload your first CV to get started — extraction and review only take a couple of minutes."
            }
            action={
              !search && (
                <Link href="/upload">
                  <Button size="sm">
                    <UploadCloud className="h-3.5 w-3.5" /> Upload a CV
                  </Button>
                </Link>
              )
            }
          />
        )}

        {/* Candidate List Card items */}
        {data && data.items.length > 0 && (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface overflow-hidden divide-y divide-border/60">
            {data.items.map((c) => {
              const isApproved = c.extraction_status === "approved";
              return (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-surface-hover/80 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <Avatar name={c.name} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/candidates/${c.id}/review`}
                          className="text-sm font-semibold text-text hover:text-accent transition-colors truncate"
                        >
                          {c.name}
                        </Link>
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-confidence-high-soft px-2 py-0.5 text-[10px] font-medium text-confidence-high border border-confidence-high/30">
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-confidence-medium-soft px-2 py-0.5 text-[10px] font-medium text-confidence-medium border border-confidence-medium/30">
                            <Clock className="h-3 w-3" /> Ready for Review
                          </span>
                        )}
                      </div>

                      {c.role_title ? (
                        <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5 truncate">
                          <Briefcase className="h-3 w-3 shrink-0 text-text-faint" />
                          <span>{c.role_title}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-text-faint mt-0.5">Role extracted from CV</p>
                      )}

                      <p className="text-[11px] text-text-faint mt-1">
                        Updated {formatDateTime(c.updated_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Link href={`/candidates/${c.id}/review`}>
                      <Button size="sm" variant="secondary" className="text-xs">
                        Review & Studio <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination controls */}
        {data && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <span className="text-xs text-text-muted">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total} candidates
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <span className="text-xs font-mono text-text-muted px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}