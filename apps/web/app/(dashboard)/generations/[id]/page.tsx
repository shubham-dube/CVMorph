"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Download,
  ArrowLeft,
  Clock,
  RefreshCw,
  FileText,
  Loader2,
  User,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { generationsApi, templatesApi, candidatesApi, ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import type { GenerationResponse } from "@/lib/types";

const STATUS_STAGES = [
  { key: "pending", label: "Queued" },
  { key: "rendering", label: "Rendering" },
  { key: "complete", label: "Complete" },
] as const;

function stageIndex(status: GenerationResponse["status"]) {
  if (status === "pending") return 0;
  if (status === "rendering") return 1;
  if (status === "complete") return 2;
  return -1; // failed
}

export default function GenerationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [pollingEnabled, setPollingEnabled] = useState(true);

  const { data: gen, isLoading, isError } = useQuery({
    queryKey: ["generation", id],
    queryFn: () => generationsApi.get(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "complete" || status === "failed") return false;
      return 2000;
    },
    enabled: pollingEnabled,
  });

  useEffect(() => {
    if (gen?.status === "complete" || gen?.status === "failed") {
      setPollingEnabled(false);
    }
  }, [gen?.status]);

  const { data: template } = useQuery({
    queryKey: ["template", gen?.template_id],
    queryFn: () => templatesApi.get(gen!.template_id),
    enabled: !!gen?.template_id,
  });

  const { data: candidate } = useQuery({
    queryKey: ["candidate", gen?.candidate_id],
    queryFn: () => candidatesApi.get(gen!.candidate_id),
    enabled: !!gen?.candidate_id,
  });

  if (isLoading) {
    return (
      <>
        <Topbar title="Generation" />
        <main className="flex-1 p-6 max-w-2xl w-full mx-auto space-y-4">
          <Skeleton className="h-56 w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
        </main>
      </>
    );
  }

  if (isError || !gen) {
    return (
      <>
        <Topbar title="Generation" />
        <main className="flex-1 p-6 max-w-2xl w-full mx-auto">
          <p className="text-sm text-danger">Couldn&apos;t load this generation.</p>
          <Button variant="ghost" className="mt-4" onClick={() => router.push("/generations")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to generations
          </Button>
        </main>
      </>
    );
  }

  const isFailed = gen.status === "failed";
  const isComplete = gen.status === "complete";
  const isPending = gen.status === "pending" || gen.status === "rendering";
  const currentStageIdx = stageIndex(gen.status);

  return (
    <>
      <Topbar title="Generation result" />
      <main className="flex-1 p-6 max-w-2xl w-full mx-auto">

        {/* Status card */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 mb-5">
          {/* Stage stepper */}
          {!isFailed && (
            <div className="flex items-center gap-0 mb-8">
              {STATUS_STAGES.map((stage, i) => {
                const done = currentStageIdx > i;
                const active = currentStageIdx === i;
                return (
                  <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                          done
                            ? "bg-confidence-high text-white"
                            : active
                            ? "bg-accent text-[color:var(--accent-contrast)] ring-4 ring-accent-soft"
                            : "bg-surface-raised border border-border text-text-faint"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : active && isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-medium whitespace-nowrap ${
                          done
                            ? "text-confidence-high"
                            : active
                            ? "text-text"
                            : "text-text-faint"
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                    {i < STATUS_STAGES.length - 1 && (
                      <div
                        className={`flex-1 h-px mx-3 mb-5 ${
                          done ? "bg-confidence-high/50" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Complete */}
          {isComplete && (
            <div className="text-center py-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-confidence-high-soft mb-4">
                <CheckCircle2 className="h-8 w-8 text-confidence-high" />
              </div>
              <h2 className="text-lg font-semibold text-text mb-1">CV ready to download</h2>
              <p className="text-sm text-text-muted mb-6">
                The formatted CV has been generated using the <strong>{template?.name ?? "selected"}</strong> template.
              </p>
              {gen.output_document_url || gen.output_pdf_url ? (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {gen.output_pdf_url && (
                    <a href={gen.output_pdf_url} download>
                      <Button size="lg" className="w-full sm:w-auto">
                        <Download className="h-4 w-4" /> Download PDF
                      </Button>
                    </a>
                  )}
                  {gen.output_document_url && (
                    <a href={gen.output_document_url} download>
                      <Button size="lg" variant={gen.output_pdf_url ? "secondary" : "default"} className="w-full sm:w-auto">
                        <Download className="h-4 w-4" /> Download DOCX
                      </Button>
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-text-faint">
                  Download URLs not available — check with your administrator.
                </p>
              )}
            </div>
          )}

          {/* Failed */}
          {isFailed && (
            <div className="text-center py-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft mb-4">
                <XCircle className="h-8 w-8 text-danger" />
              </div>
              <h2 className="text-lg font-semibold text-text mb-1">Generation failed</h2>
              <p className="text-sm text-danger mb-2 font-mono text-left rounded-[var(--radius-md)] bg-danger-soft border border-danger/20 px-4 py-3">
                {gen.error_message ?? "An unknown error occurred during rendering."}
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/candidates/${gen.candidate_id}/generate`)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            </div>
          )}

          {/* In progress */}
          {isPending && (
            <div className="text-center py-4">
              <p className="text-sm text-text-muted">
                Your CV is being generated — this usually takes 15–30 seconds. This page updates
                automatically.
              </p>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface divide-y divide-border">
          {[
            {
              icon: User,
              label: "Candidate",
              value: candidate?.name,
              action: candidate && (
                <button
                  className="text-accent text-xs hover:underline"
                  onClick={() => router.push(`/candidates/${gen.candidate_id}/review`)}
                >
                  View profile →
                </button>
              ),
            },
            {
              icon: FileText,
              label: "Template",
              value: template?.name ?? gen.template_id,
            },
            {
              icon: Clock,
              label: "Started",
              value: formatDateTime(gen.created_at),
            },
            gen.formatting_instructions
              ? {
                  icon: RefreshCw,
                  label: "Formatting instructions",
                  value: gen.formatting_instructions,
                }
              : null,
          ]
            .filter(Boolean)
            .map((row) => {
              if (!row) return null;
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-start gap-3 px-5 py-3.5">
                  <Icon className="h-4 w-4 text-text-faint mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-0.5">
                      {row.label}
                    </p>
                    <p className="text-[13px] text-text break-words">{row.value ?? "—"}</p>
                    {row.action && <div className="mt-1">{row.action}</div>}
                  </div>
                </div>
              );
            })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-5"
          onClick={() => router.push("/generations")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All generations
        </Button>
      </main>
    </>
  );
}
