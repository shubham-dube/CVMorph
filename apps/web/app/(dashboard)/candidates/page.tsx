"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, UploadCloud, ChevronLeft, ChevronRight } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { candidatesApi } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 20;

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
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
        <div className="flex items-center justify-between mb-5 gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint" />
            <Input
              placeholder="Search candidates..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
          <Link href="/upload">
            <Button size="sm">
              <UploadCloud className="h-3.5 w-3.5" /> Upload CV
            </Button>
          </Link>
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

        {data && data.items.length > 0 && (
          <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
            {data.items.map((c, i) => (
              <Link
                key={c.id}
                href={`/candidates/${c.id}/review`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors ${
                  i !== data.items.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text truncate">{c.name}</p>
                  <p className="text-xs text-text-faint">Updated {formatDateTime(c.updated_at)}</p>
                </div>
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