"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, ChevronRight, LayoutTemplate, FileText, Loader2, Info } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Input";
import { templatesApi, generationsApi, candidatesApi, ApiError } from "@/lib/api-client";

export default function GeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const { data: candidate } = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => candidatesApi.get(id),
  });

  const { data: templates, isLoading: templatesLoading, isError } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templatesApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () =>
      generationsApi.create(id, selectedTemplate!, instructions.trim() || undefined),
    onSuccess: (gen) => {
      toast.success("CV generation started — tracking progress…");
      router.push(`/generations/${gen.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to start generation.");
    },
  });

  return (
    <>
      <Topbar title="Generate CV" />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-text-faint mb-2">
            <span
              className="hover:text-text cursor-pointer transition-colors"
              onClick={() => router.push("/candidates")}
            >
              Candidates
            </span>
            <ChevronRight className="h-3 w-3" />
            <span
              className="hover:text-text cursor-pointer transition-colors"
              onClick={() => router.push(`/candidates/${id}/review`)}
            >
              {candidate?.name ?? "Review"}
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-muted">Generate</span>
          </div>
          <h2 className="text-xl font-semibold text-text">
            {candidate ? `Generate CV — ${candidate.name}` : "Generate CV"}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Choose a template below. The approved profile will be rendered into the selected format.
          </p>
        </div>

        {/* Template grid */}
        <section className="mb-8">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-4">
            Choose a template
          </h3>

          {templatesLoading && (
            <div className="grid sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-[var(--radius-lg)]" />
              ))}
            </div>
          )}

          {isError && (
            <EmptyState
              title="Couldn't load templates"
              description="Check the API connection and try refreshing."
            />
          )}

          {templates && templates.length === 0 && (
            <EmptyState
              icon={<LayoutTemplate className="h-8 w-8" />}
              title="No templates available"
              description="Ask your admin to upload a template before generating CVs."
            />
          )}

          {templates && templates.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {templates
                .filter((t) => t.is_active)
                .map((t) => {
                  const isSelected = selectedTemplate === t.id;
                  const sections: string[] = t.config_json?.sections ?? [];
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`relative text-left rounded-[var(--radius-lg)] border p-5 transition-all ${
                        isSelected
                          ? "border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent)]"
                          : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-[8px] ${
                            isSelected ? "bg-accent text-[color:var(--accent-contrast)]" : "bg-surface-raised border border-border"
                          }`}
                        >
                          <FileText className="h-4.5 w-4.5" />
                        </div>
                        {isSelected && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[color:var(--accent-contrast)] shrink-0">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 12 12">
                              <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <p className="text-[14px] font-semibold text-text mb-1">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-text-muted mb-3 line-clamp-2">{t.description}</p>
                      )}
                      {sections.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-auto">
                          {sections.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-text-faint"
                            >
                              {s}
                            </span>
                          ))}
                          {sections.length > 4 && (
                            <span className="text-[10px] text-text-faint">+{sections.length - 4} more</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </section>

        {/* Formatting instructions */}
        <section className="mb-8">
          <button
            onClick={() => setShowInstructions((s) => !s)}
            className="flex items-center gap-2 text-[13px] font-medium text-text-muted hover:text-text transition-colors mb-2"
          >
            <Info className="h-3.5 w-3.5" />
            {showInstructions ? "Hide" : "Add"} formatting instructions{" "}
            <span className="text-text-faint font-normal">(optional)</span>
          </button>
          {showInstructions && (
            <div className="animate-fade-in">
              <Textarea
                placeholder='e.g. "Emphasise the most recent role" or "Use senior-level language throughout"'
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-text-faint mt-1.5">
                Guides how the template is populated. It cannot introduce facts not in the approved
                profile.
              </p>
            </div>
          )}
        </section>

        {/* Action */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button variant="ghost" onClick={() => router.push(`/candidates/${id}/review`)}>
            ← Back to review
          </Button>
          <Button
            disabled={!selectedTemplate || mutation.isPending}
            onClick={() => mutation.mutate()}
            size="lg"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate CV
          </Button>
        </div>
      </main>
    </>
  );
}
