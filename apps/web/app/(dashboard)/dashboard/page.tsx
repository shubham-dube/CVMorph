"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  FileStack,
  Sparkles,
  CheckCircle2,
  UploadCloud,
  ArrowRight,
  Download,
  Clock,
  LayoutTemplate,
  FileText,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, templatesApi } from "@/lib/api-client";
import { initials, formatDateTime, formatPercent } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: stats, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardApi.getStats(),
    staleTime: 10_000,
  });

  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templatesApi.list(),
  });

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = user?.name
    ? user.name.trim().split(/\s+/)[0]
    : user?.email
    ? user.email.split("@")[0]
    : "";

  return (
    <>
      <Topbar title="Overview Dashboard" />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Greeting Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
              {firstName ? `${greeting}, ${firstName}` : greeting}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-text-muted font-medium">
              {todayFormatted}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => router.push("/upload")}
              className="text-xs font-semibold h-9 shadow-sm shadow-accent/20"
            >
              <UploadCloud className="h-4 w-4 mr-1.5" />
              Upload CV
            </Button>
          </div>
        </div>

        {/* 3 Executive KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Card 1: Total Candidates */}
          <Card className="relative overflow-hidden border border-border bg-surface hover:border-border-focus transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Total Candidates
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-text">
                      {stats?.total_candidates ?? 0}
                    </span>
                    <span className="text-xs text-text-muted font-medium">candidates</span>
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">Registered in candidate directory</p>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Formatted Profiles */}
          <Card className="relative overflow-hidden border border-border bg-surface hover:border-border-focus transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Profiles Created
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                  <FileText className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-text">
                      {stats?.total_profiles ?? 0}
                    </span>
                    <span className="text-xs text-purple-400 font-medium">
                      {(stats?.total_profiles ?? 0) > (stats?.total_candidates ?? 0)
                        ? `+${(stats?.total_profiles ?? 0) - (stats?.total_candidates ?? 0)} tailored`
                        : "active versions"}
                    </span>
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">Master & role-tailored versions</p>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Total Formatted CVs Generated */}
          <Card className="relative overflow-hidden border border-border bg-surface hover:border-border-focus transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Total CVs Generated
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Download className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-text">
                      {stats?.total_generations ?? 0}
                    </span>
                    <span className="text-xs text-emerald-400 font-medium">exports</span>
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">Compiled DOCX & PDF documents exported</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Operational Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Recent Pipeline Activity */}
          <div className="lg:col-span-2 space-y-6">
            {/* Widget 1: Recent Candidates */}
            <Card className="border border-border bg-surface">
              <div className="flex items-center justify-between p-5 border-b border-border/80">
                <div>
                  <h3 className="text-sm font-semibold text-text">Recent Candidates</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Active candidates parsed and ready for review or export
                  </p>
                </div>
                <Link
                  href="/candidates"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong transition-colors"
                >
                  View All Candidates <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-5 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-9 w-9 rounded-lg" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                        <Skeleton className="h-7 w-20" />
                      </div>
                    ))}
                  </div>
                ) : stats?.recent_candidates && stats.recent_candidates.length > 0 ? (
                  <div className="divide-y divide-border/60">
                    {stats.recent_candidates.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover/60 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent text-xs font-bold border border-accent/20">
                            {initials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/candidates/${c.id}/review`}
                              className="text-xs font-semibold text-text hover:text-accent truncate block"
                            >
                              {c.name}
                            </Link>
                            <p className="text-[11px] text-text-muted truncate">
                              {c.role_title || "General Candidate"} • {formatDateTime(c.created_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/candidates/${c.id}/review`)}
                            className="text-xs h-7 px-2.5"
                          >
                            Open Studio <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <Users className="h-8 w-8 mx-auto text-text-faint mb-2" />
                    <p className="text-xs text-text-muted">No candidates registered yet.</p>
                    <Button
                      size="sm"
                      className="mt-3 text-xs"
                      onClick={() => router.push("/upload")}
                    >
                      Upload your first CV
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Widget 2: Recent Generated Documents */}
            <Card className="border border-border bg-surface">
              <div className="flex items-center justify-between p-5 border-b border-border/80">
                <div>
                  <h3 className="text-sm font-semibold text-text">Recent Formatted CVs</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Recently compiled documents available for immediate download
                  </p>
                </div>
                <Link
                  href="/generations"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong transition-colors"
                >
                  View All Exports <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-5 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : stats?.recent_generations && stats.recent_generations.length > 0 ? (
                  <div className="divide-y divide-border/60">
                    {stats.recent_generations.map((g) => (
                      <div
                        key={g.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-hover/60 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-text-muted">
                            <FileStack className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-text truncate">
                              {g.output_filename || g.candidate_name}
                            </p>
                            <p className="text-[11px] text-text-muted truncate">
                              For <span className="font-medium text-text-faint">{g.candidate_name}</span> •{" "}
                              <span className="rounded bg-surface-hover px-1 py-0.5 text-[10px]">
                                {g.template_name}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {g.docx_url && (
                            <a
                              href={g.docx_url}
                              download
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-surface hover:bg-surface-hover text-[11px] font-medium text-text transition-colors"
                              title="Download DOCX file"
                            >
                              <Download className="h-3 w-3" /> DOCX
                            </a>
                          )}
                          {g.pdf_url && (
                            <a
                              href={g.pdf_url}
                              download
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent hover:bg-accent-strong text-[11px] font-semibold text-white transition-colors"
                              title="Download PDF file"
                            >
                              <Download className="h-3 w-3" /> PDF
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <FileStack className="h-8 w-8 mx-auto text-text-faint mb-2" />
                    <p className="text-xs text-text-muted">No documents generated yet.</p>
                    <p className="text-[11px] text-text-faint mt-0.5">
                      Open a candidate profile and click Render Preview or Generate.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Quick Launchers & Templates Showcase */}
          <div className="space-y-6">
            {/* Quick Actions Card */}
            <Card className="border border-border bg-surface">
              <div className="p-5 border-b border-border/80">
                <h3 className="text-sm font-semibold text-text">Quick Actions</h3>
                <p className="text-xs text-text-muted mt-0.5">Jump directly into high-frequency workflows</p>
              </div>
              <CardContent className="p-4 space-y-2">
                <button
                  onClick={() => router.push("/upload")}
                  className="w-full flex items-center justify-between p-3 rounded-[var(--radius-md)] border border-border/80 bg-surface-hover/50 hover:bg-surface-hover hover:border-accent/40 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent group-hover:scale-105 transition-transform">
                      <UploadCloud className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">Upload Candidate CV</p>
                      <p className="text-[11px] text-text-muted">PDF or DOCX document parsing</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-faint group-hover:text-text transition-colors" />
                </button>

                <button
                  onClick={() => router.push("/candidates")}
                  className="w-full flex items-center justify-between p-3 rounded-[var(--radius-md)] border border-border/80 bg-surface-hover/50 hover:bg-surface-hover hover:border-accent/40 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 group-hover:scale-105 transition-transform">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">Candidate Directory</p>
                      <p className="text-[11px] text-text-muted">Search, filter & review profiles</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-faint group-hover:text-text transition-colors" />
                </button>

                <button
                  onClick={() => router.push("/templates")}
                  className="w-full flex items-center justify-between p-3 rounded-[var(--radius-md)] border border-border/80 bg-surface-hover/50 hover:bg-surface-hover hover:border-accent/40 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform">
                      <LayoutTemplate className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">Branded Templates</p>
                      <p className="text-[11px] text-text-muted">Manage DOCX & system layouts</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-faint group-hover:text-text transition-colors" />
                </button>
              </CardContent>
            </Card>

            {/* Active Templates Showcase */}
            <Card className="border border-border bg-surface">
              <div className="flex items-center justify-between p-5 border-b border-border/80">
                <div>
                  <h3 className="text-sm font-semibold text-text">Active Templates</h3>
                  <p className="text-xs text-text-muted mt-0.5">Seeded corporate & tech layouts</p>
                </div>
                <Link
                  href="/templates"
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Manage
                </Link>
              </div>
              <CardContent className="p-4 space-y-2.5">
                {templates && templates.length > 0 ? (
                  templates.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2.5 rounded-[var(--radius-sm)] border border-border bg-bg/50"
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <div className="h-6 w-6 rounded bg-accent-soft flex items-center justify-center text-accent text-[10px] font-bold">
                          DOCX
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text truncate">
                            {t.name} {t.is_system && <span className="text-accent">★</span>}
                          </p>
                          <p className="text-[10px] text-text-muted">
                            {t.is_system ? "System Certified" : "Custom Layout"}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                        Ready
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-text-muted text-center py-3">Loading templates...</p>
                )}
              </CardContent>
            </Card>


          </div>
        </div>
      </main>
    </>
  );
}
