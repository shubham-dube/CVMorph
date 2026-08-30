"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Palette,
  BarChart3,
  Save,
  Loader2,
  Upload,
  TrendingUp,
  FileStack,
  FilePlus,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { orgsApi, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { OrgBranding } from "@/lib/types";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <>
      <Topbar title="Settings" />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-8">
        <OrgSection />
        {isAdmin && <BrandingSection />}
        <UsageSection />
      </main>
    </>
  );
}

// ── Org info ──────────────────────────────────────────────────────────────────

function OrgSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["org"],
    queryFn: () => orgsApi.me(),
  });

  return (
    <section>
      <SectionHeader icon={Building2} title="Organisation" />
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface divide-y divide-border">
        {isLoading ? (
          <div className="px-5 py-4 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : data ? (
          <>
            <Row label="Name" value={data.name} />
            <Row label="Plan" value={<PlanBadge tier={data.plan_tier} />} />
            <Row label="Org ID" value={<span className="font-mono text-xs text-text-faint">{data.id}</span>} />
          </>
        ) : (
          <div className="px-5 py-4 text-sm text-text-muted">Couldn&apos;t load org info.</div>
        )}
      </div>
    </section>
  );
}

// ── Branding ──────────────────────────────────────────────────────────────────

function BrandingSection() {
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["org"],
    queryFn: () => orgsApi.me(),
  });

  const [draft, setDraft] = useState<Partial<OrgBranding>>({});
  const branding = { ...org?.branding_config, ...draft };

  const mutation = useMutation({
    mutationFn: () => orgsApi.updateBranding(draft),
    onSuccess: () => {
      toast.success("Branding saved.");
      queryClient.invalidateQueries({ queryKey: ["org"] });
      setDraft({});
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save branding.");
    },
  });

  const isDirty = Object.keys(draft).length > 0;

  return (
    <section>
      <SectionHeader icon={Palette} title="Branding" subtitle="Admin only" />
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <>
            <Field label="Logo URL" hint="Direct URL to your company logo (PNG/SVG recommended)">
              <Input
                placeholder="https://example.com/logo.png"
                value={branding.logo_url ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, logo_url: e.target.value || null }))}
              />
            </Field>
            <Field label="Primary colour" hint="Used for template accent colour (hex, e.g. #6d5bd0)">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={branding.primary_color ?? "#6d5bd0"}
                  onChange={(e) => setDraft((d) => ({ ...d, primary_color: e.target.value }))}
                  className="h-9 w-12 rounded-[var(--radius-sm)] border border-border bg-transparent cursor-pointer"
                />
                <Input
                  placeholder="#6d5bd0"
                  value={branding.primary_color ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, primary_color: e.target.value || null }))}
                  className="flex-1"
                />
              </div>
            </Field>
            <Field label="Font" hint="Font name used in generated documents (e.g. Calibri, Arial)">
              <Input
                placeholder="Calibri"
                value={branding.font ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, font: e.target.value || null }))}
              />
            </Field>

            {branding.logo_url && (
              <div className="rounded-[var(--radius-md)] border border-border p-4 bg-surface-raised">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
                  Logo preview
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={branding.logo_url}
                  alt="Logo preview"
                  className="max-h-12 max-w-[180px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                disabled={!isDirty || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save branding
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
        <SectionHeader icon={BarChart3} title="Usage" className="mb-0" />
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
          Detailed per-recruiter analytics are planned for a future release.
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[13px] font-medium text-text-muted mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-text-faint mt-1">{hint}</p>}
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
