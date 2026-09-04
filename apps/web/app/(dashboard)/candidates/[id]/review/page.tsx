"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Mail, Phone, MapPin, Pencil, Check, Sparkles, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  ApproveBar,
  ConfidenceBadge,
  ReviewableBullet,
  SkillGroupCard,
  EmploymentEntryCard,
  PreviewPanel,
} from "@/components/review";
import { candidatesApi, ApiError } from "@/lib/api-client";
import { getByPath, setByPath, removeAtPath, collectFlaggedFields } from "@/lib/profile-utils";
import type { CandidateProfile, EmploymentEntry } from "@/lib/types";

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile", id],
    queryFn: () => candidatesApi.getProfile(id),
  });

  const { data: events } = useQuery({
    queryKey: ["review-events", id],
    queryFn: () => candidatesApi.reviewEvents(id),
    enabled: !!data,
  });

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [reviewedPaths, setReviewedPaths] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (data) {
      setProfile(data.profile);
      setNameDraft(data.profile.candidate.full_name || "");
      setRoleDraft(data.profile.candidate.role_title || "");
    }
  }, [data]);

  useEffect(() => {
    if (events) setReviewedPaths(new Set(events.map((e) => e.field_path)));
  }, [events]);

  const flagged = useMemo(() => (profile ? collectFlaggedFields(profile) : []), [profile]);
  const reviewedCount = flagged.filter((f) => reviewedPaths.has(f.path)).length;
  const alreadyApproved = data?.extraction_status === "approved";

  const patchMutation = useMutation({
    mutationFn: (vars: {
      path: string;
      action: "confirm" | "edit" | "remove";
      oldValue: unknown;
      newValue: unknown;
      nextProfile: CandidateProfile;
    }) =>
      candidatesApi.patchProfile(id, {
        field_path: vars.path,
        action: vars.action,
        old_value: vars.oldValue,
        new_value: vars.newValue,
        profile: vars.nextProfile,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", id] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that change.");
    },
  });

  function applyChange(
    path: string,
    action: "confirm" | "edit" | "remove",
    newProfile: CandidateProfile,
    oldValue: unknown,
    newValue: unknown
  ) {
    setProfile(newProfile);
    setIsDirty(true);
    setReviewedPaths((prev) => new Set(prev).add(path));
    patchMutation.mutate({ path, action, oldValue, newValue, nextProfile: newProfile });
  }

  function handleConfirm(path: string) {
    if (!profile) return;
    const value = getByPath(profile, path);
    applyChange(path, "confirm", profile, value, value);
    toast.success("Item verified.");
  }

  function handleEdit(path: string, newText: string) {
    if (!profile) return;
    const oldValue = getByPath(profile, path);
    const next = setByPath(profile, path, newText);
    applyChange(path, "edit", next, oldValue, newText);
    toast.success("Saved edit.");
  }

  function handleEditGroup(path: string, category: string, skills: string[]) {
    if (!profile) return;
    const oldValue = getByPath(profile, path);
    const current = oldValue as {
      category: string;
      skills: string[];
      confidence: number;
      source_type: string;
      evidence: string | null;
    };
    const newValue = { ...current, category, skills };
    const next = setByPath(profile, path, newValue);
    applyChange(path, "edit", next, oldValue, newValue);
    toast.success("Skill category updated.");
  }

  function handleUpdateEmploymentEntry(jobIndex: number, updated: Partial<EmploymentEntry>) {
    if (!profile) return;
    const current = profile.employment[jobIndex];
    const nextJob: EmploymentEntry = { ...current, ...updated };
    const nextEmployment = [...profile.employment];
    nextEmployment[jobIndex] = nextJob;
    const nextProfile: CandidateProfile = { ...profile, employment: nextEmployment };
    applyChange(`employment.${jobIndex}`, "edit", nextProfile, current, nextJob);
    toast.success("Experience details updated.");
  }

  function handleRemove(path: string) {
    if (!profile) return;
    const oldValue = getByPath(profile, path.replace(/\.text$/, ""));
    const arrayPath = path.replace(/\.text$/, "");
    const next = removeAtPath(profile, arrayPath);
    applyChange(path, "remove", next, oldValue, null);
    toast.success("Item removed.");
  }

  function jumpToNext() {
    const next = flagged.find((f) => !reviewedPaths.has(f.path));
    if (!next) return;
    const el = document.getElementById(next.path);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-accent");
    setTimeout(() => el?.classList.remove("ring-2", "ring-accent"), 1600);
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await candidatesApi.approveProfile(id);
      toast.success(res.message || "Profile approved. Ready for generation.");
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["profile", id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't approve this profile.");
    } finally {
      setApproving(false);
    }
  }

  function saveHeader() {
    if (!profile) return;
    let next = setByPath(profile, "candidate.full_name", nameDraft.trim());
    next = setByPath(next, "candidate.role_title", roleDraft.trim());
    applyChange("candidate.full_name", "edit", next, profile.candidate.full_name, nameDraft.trim());
    setEditingHeader(false);
    toast.success("Candidate header updated.");
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Review & Studio" />
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-4">
          <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-7 space-y-4">
              <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
              <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
            </div>
            <div className="xl:col-span-5">
              <Skeleton className="h-[500px] w-full rounded-[var(--radius-lg)]" />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (isError || !profile) {
    return (
      <>
        <Topbar title="Review & Studio" />
        <main className="flex-1 p-6 max-w-3xl w-full mx-auto">
          <p className="text-sm text-danger">Couldn&apos;t load this candidate&apos;s profile.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Review & Studio" />
      <main className="flex-1 px-6 pt-0 pb-12 max-w-7xl w-full mx-auto">
        <ApproveBar
          totalFlagged={flagged.length}
          reviewedCount={reviewedCount}
          onApprove={handleApprove}
          onJumpToNext={jumpToNext}
          approving={approving}
          candidateName={profile.candidate.full_name}
          alreadyApproved={alreadyApproved}
          isDirty={isDirty}
        />

        {/* Studio View Mode Bar */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">
              Workspace View: <span className="text-text font-semibold">{showPreview ? "Split Studio" : "Full-Width Editor"}</span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs h-8"
          >
            {showPreview ? (
              <>
                <PanelRightClose className="h-3.5 w-3.5 mr-1.5" />
                Collapse Preview
              </>
            ) : (
              <>
                <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" />
                Open Live Preview Studio
              </>
            )}
          </Button>
        </div>

        {/* Split Studio Layout */}
        <div className={`grid grid-cols-1 ${showPreview ? "xl:grid-cols-12 gap-8" : "max-w-4xl mx-auto"} items-start`}>
          {/* Left Column: Editor */}
          <div className={`${showPreview ? "xl:col-span-7" : "w-full"} space-y-6`}>
            {/* Candidate Header Card */}
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-xs">
              {editingHeader ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-text-muted mb-1 block">Full Name</label>
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Candidate full name"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-text-muted mb-1 block">
                      Target Role / Title (Cover Page & Header)
                    </label>
                    <Input
                      value={roleDraft}
                      onChange={(e) => setRoleDraft(e.target.value)}
                      placeholder="e.g. Senior Full Stack Engineer"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditingHeader(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveHeader}>
                      <Check className="h-3.5 w-3.5" /> Save Details
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-text tracking-tight">{profile.candidate.full_name}</h2>
                    <p className="text-sm text-accent font-semibold mt-0.5">{profile.candidate.role_title}</p>
                    <div className="flex items-center gap-4 mt-2.5 text-xs text-text-muted flex-wrap">
                      {profile.candidate.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {profile.candidate.email}
                        </span>
                      )}
                      {profile.candidate.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {profile.candidate.phone}
                        </span>
                      )}
                      {profile.candidate.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {profile.candidate.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ConfidenceBadge confidence={profile.meta.overall_confidence} />
                    <button
                      onClick={() => {
                        setNameDraft(profile.candidate.full_name);
                        setRoleDraft(profile.candidate.role_title);
                        setEditingHeader(true);
                      }}
                      className="text-xs text-text-faint hover:text-text flex items-center gap-1 p-1 rounded hover:bg-surface-hover transition-colors"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Expand / Collapse toggle */}
            <div className="flex justify-end">
              <button
                onClick={() => setExpandAll((s) => !s)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text cursor-pointer transition-colors"
              >
                {expandAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expandAll ? "Collapse reviewed items" : "Expand all review items"}
              </button>
            </div>

            {/* Career summary */}
            <Section title="Career Summary">
              <div className="space-y-1.5 bg-surface rounded-[var(--radius-lg)] border border-border p-4">
                {profile.career_summary.bullets.map((b, i) => {
                  const path = `career_summary.bullets.${i}.text`;
                  return (
                    <ReviewableBullet
                      key={i}
                      fieldPath={path}
                      text={b.text}
                      confidence={b.confidence}
                      sourceType={b.source_type}
                      evidence={b.evidence}
                      reviewed={reviewedPaths.has(path)}
                      forceExpanded={expandAll}
                      onConfirm={() => handleConfirm(path)}
                      onEdit={(t) => handleEdit(path, t)}
                      onRemove={() => handleRemove(path)}
                    />
                  );
                })}
              </div>
            </Section>

            {/* Technical skills */}
            <Section title="Technical Capabilities">
              <div className="grid sm:grid-cols-2 gap-3">
                {profile.technical_skills.groups.map((g, i) => {
                  const path = `technical_skills.groups.${i}`;
                  return (
                    <SkillGroupCard
                      key={i}
                      fieldPath={path}
                      category={g.category}
                      skills={g.skills}
                      confidence={g.confidence}
                      reviewed={reviewedPaths.has(path)}
                      onConfirm={() => handleConfirm(path)}
                      onEdit={(cat, skills) => handleEditGroup(path, cat, skills)}
                      onRemove={() => handleRemove(path)}
                    />
                  );
                })}
              </div>
            </Section>

            {/* Education */}
            <Section
              title={
                profile.education.has_certifications
                  ? "Educational Qualifications & Certifications"
                  : "Educational Qualifications"
              }
            >
              <div className="space-y-1.5 bg-surface rounded-[var(--radius-lg)] border border-border p-4">
                {profile.education.items.map((it, i) => {
                  const path = `education.items.${i}.text`;
                  return (
                    <ReviewableBullet
                      key={i}
                      fieldPath={path}
                      text={it.text}
                      confidence={it.confidence}
                      sourceType={it.source_type}
                      evidence={it.evidence}
                      reviewed={reviewedPaths.has(path)}
                      forceExpanded={expandAll}
                      onConfirm={() => handleConfirm(path)}
                      onEdit={(t) => handleEdit(path, t)}
                      onRemove={() => handleRemove(path)}
                    />
                  );
                })}
              </div>
            </Section>

            {/* Employment */}
            <Section title="Employment Summary & Client Projects">
              <div className="space-y-4">
                {profile.employment.map((job, ji) => (
                  <EmploymentEntryCard
                    key={ji}
                    entry={job}
                    index={ji}
                    isReviewed={(p) => reviewedPaths.has(p)}
                    onConfirm={(p) => handleConfirm(p)}
                    onEditResponsibility={(ri, text) =>
                      handleEdit(`employment.${ji}.responsibilities.${ri}.text`, text)
                    }
                    onRemoveResponsibility={(ri) =>
                      handleRemove(`employment.${ji}.responsibilities.${ri}.text`)
                    }
                    onUpdateEntry={handleUpdateEmploymentEntry}
                  />
                ))}
              </div>
            </Section>
          </div>

          {/* Right Column: Live CV Studio Preview */}
          {showPreview && (
            <div className="xl:col-span-5">
              <PreviewPanel
                candidateId={id}
                candidateName={profile.candidate.full_name}
                onClose={() => setShowPreview(false)}
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-faint px-1">{title}</h3>
      {children}
    </section>
  );
}