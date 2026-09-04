"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  FileSignature,
  BarChart3,
  Save,
  Loader2,
  TrendingUp,
  FileStack,
  FilePlus,
  Upload,
  Sparkles,
  Check,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { orgsApi, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const PRESETS = [
  "Resume - {Name} - {Role}",
  "CVMorph - {Name} - {Role}",
  "CV - {Name} - {Role}",
  "{Name} - {Role} - {Date}",
  "{Name}_{Role}",
];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <>
      <Topbar title="Settings" />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-8">
        <OrgSection />
        {isAdmin && <ResumeNamingSection />}
        <UsageSection />
      </main>
    </>
  );
}

// ── Org info ──────────────────────────────────────────────────────────────────

function OrgSection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org"],
    queryFn: () => orgsApi.me(),
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const nameMutation = useMutation({
    mutationFn: (newName: string) => orgsApi.updateOrg({ name: newName }),
    onSuccess: () => {
      toast.success("Workspace name updated.");
      queryClient.invalidateQueries({ queryKey: ["org"] });
      setEditingName(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update workspace name.");
    },
  });

  return (
    <section>
      <SectionHeader icon={Building2} title="Workspace & Organisation" />
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface divide-y divide-border">
        {isLoading ? (
          <div className="px-5 py-4 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : data ? (
          <>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[13px] text-text-muted">Workspace Name</span>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="h-8 text-xs max-w-xs"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={nameMutation.isPending || !nameDraft.trim()}
                    onClick={() => nameMutation.mutate(nameDraft.trim())}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => setEditingName(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <span className="text-[13px] font-semibold text-text">{data.name}</span>
                  <button
                    onClick={() => {
                      setNameDraft(data.name);
                      setEditingName(true);
                    }}
                    className="text-xs text-text-faint hover:text-text cursor-pointer p-1 rounded hover:bg-surface-hover transition-colors"
                    title="Change workspace name"
                  >
                    Rename
                  </button>
                </div>
              )}
            </div>
            <Row label="Plan Tier" value={<PlanBadge tier={data.plan_tier} />} />
            <Row label="Tenant ID" value={<span className="font-mono text-xs text-text-faint">{data.id}</span>} />
          </>
        ) : (
          <div className="px-5 py-4 text-sm text-text-muted">Couldn&apos;t load workspace info.</div>
        )}
      </div>
    </section>
  );
}

// ── Dynamic Resume Naming Convention ──────────────────────────────────────────

function ResumeNamingSection() {
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["org"],
    queryFn: () => orgsApi.me(),
  });

  const [pattern, setPattern] = useState<string>("CVMorph - {Name} - {Role}");

  useEffect(() => {
    if (org?.branding_config?.naming_pattern) {
      setPattern(org.branding_config.naming_pattern);
    }
  }, [org]);

  const mutation = useMutation({
    mutationFn: () => orgsApi.updateBranding({ naming_pattern: pattern }),
    onSuccess: () => {
      toast.success("Resume naming convention saved.");
      queryClient.invalidateQueries({ queryKey: ["org"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save naming pattern.");
    },
  });

  // Calculate live preview example
  const today = new Date().toISOString().split("T")[0];
  const sampleName = "Shubham Dubey";
  const sampleRole = "Software Engineer";
  const previewFilename = pattern
    .replace("{Name}", sampleName)
    .replace("{Role}", sampleRole)
    .replace("{Date}", today)
    .replace("{OrgName}", org?.name || "CVMorph");

  const isConfigDirty = Boolean(org?.branding_config && org.branding_config.naming_pattern !== pattern);

  return (
    <section>
      <SectionHeader
        icon={FileSignature}
        title="Resume Naming Convention"
        subtitle="Dynamic File Pattern"
      />
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-[13px] font-medium text-text mb-1 block">
                Naming Pattern
              </label>
              <p className="text-xs text-text-muted mb-2.5">
                Variables will be automatically replaced when compiling documents.
              </p>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="e.g. Resume - {Name} - {Role}"
                className="font-mono text-xs"
              />
            </div>

            {/* Quick preset selector */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-2">
                Suggested Presets
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPattern(preset)}
                    className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-mono transition-colors cursor-pointer ${
                      pattern === preset
                        ? "bg-accent text-white border-accent"
                        : "bg-surface-raised border-border text-text-muted hover:text-text hover:border-border-strong"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Available variables */}
            <div className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3.5 space-y-2 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-faint block">
                Available Tokens
              </span>
              <div className="grid grid-cols-2 gap-2 text-text-muted font-mono text-[11px]">
                <div><code className="text-accent font-bold">{"{Name}"}</code> — Candidate Full Name</div>
                <div><code className="text-accent font-bold">{"{Role}"}</code> — Target Job Role</div>
                <div><code className="text-accent font-bold">{"{Date}"}</code> — Current Date (YYYY-MM-DD)</div>
                <div><code className="text-accent font-bold">{"{OrgName}"}</code> — Workspace Name</div>
              </div>
            </div>

            {/* Live Example Preview Box */}
            <div className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-accent text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                Live Generated Filename Preview
              </div>
              <div className="font-mono text-xs text-text space-y-1 pt-1">
                <p className="truncate">
                  <span className="text-text-faint">DOCX: </span>
                  <span className="font-medium text-text">{previewFilename}.docx</span>
                </p>
                <p className="truncate">
                  <span className="text-text-faint">PDF: </span>
                  <span className="font-medium text-text">{previewFilename}.pdf</span>
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                disabled={mutation.isPending || !pattern.trim() || !isConfigDirty}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Naming Convention
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ── Usage ─────────────────────────────────────────────────────────────────────

function UsageSection() {
  const [period, setPeriod] = useState<"all_time" | "this_month">("this_month");

  const { data, isLoading } = useQuery({
    queryKey: ["usage", period],
    queryFn: () => orgsApi.usage(period),
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader icon={BarChart3} title="Usage & Analytics" className="mb-0" />
        <div className="flex items-center rounded-[var(--radius-sm)] border border-border overflow-hidden">
          {(["this_month", "all_time"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                period === p
                  ? "bg-accent text-[color:var(--accent-contrast)]"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              {p === "this_month" ? "This month" : "All time"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Upload, label: "CVs uploaded", value: data?.total_cvs_uploaded },
          { icon: FilePlus, label: "CVs generated", value: data?.total_cvs_generated },
          { icon: FileStack, label: "API calls", value: data?.total_api_calls },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-[var(--radius-lg)] border border-border bg-surface p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4 text-text-faint" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                {label}
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-text font-mono">
                {value?.toLocaleString() ?? "—"}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-raised px-4 py-3 flex items-start gap-2.5">
        <TrendingUp className="h-4 w-4 text-accent mt-0.5 shrink-0" />
        <p className="text-[13px] text-text-muted">
          Usage data reflects {period === "this_month" ? "the current calendar month" : "all time"}.
        </p>
      </div>
    </section>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  className = "mb-4",
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Icon className="h-4 w-4 text-text-faint" />
      <h2 className="text-[15px] font-semibold text-text">{title}</h2>
      {subtitle && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint bg-surface-raised border border-border rounded-full px-2 py-0.5">
          {subtitle}
        </span>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-[13px] text-text-muted">{label}</span>
      <span className="text-[13px] font-medium text-text">{value}</span>
    </div>
  );
}

function PlanBadge({ tier }: { tier: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent capitalize">
      {tier}
    </span>
  );
}
