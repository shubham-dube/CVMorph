"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Mail, Phone, MapPin, Pencil, Check } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApproveBar, ConfidenceBadge, ReviewableBullet, SkillGroupCard, EmploymentEntryCard } from "@/components/review";
import { candidatesApi, ApiError } from "@/lib/api-client";
import { getByPath, setByPath, removeAtPath, collectFlaggedFields } from "@/lib/profile-utils";
import type { CandidateProfile } from "@/lib/types";
import type { ApiErrorDetail } from "@/lib/types";

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

  useEffect(() => {
    if (data) setProfile(data.profile);
  }, [data]);

  useEffect(() => {
    if (events) setReviewedPaths(new Set(events.map((e) => e.field_path)));
  }, [events]);

  const flagged = useMemo(() => (profile ? collectFlaggedFields(profile) : []), [profile]);
  const reviewedCount = flagged.filter((f) => reviewedPaths.has(f.path)).length;
  const alreadyApproved = data?.extraction_status === "approved";

  const patchMutation = useMutation({
    mutationFn: (vars: { path: string; action: "confirm" | "edit" | "remove"; oldValue: unknown; newValue: unknown; nextProfile: CandidateProfile }) =>
      candidatesApi.patchProfile(id, {
        field_path: vars.path,
        action: vars.action,
        old_value: vars.oldValue,
        new_value: vars.newValue,
        profile: vars.nextProfile,
      }),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that change.");
    },
  });

  function applyChange(path: string, action: "confirm" | "edit" | "remove", newProfile: CandidateProfile, oldValue: unknown, newValue: unknown) {
    setProfile(newProfile);
    setReviewedPaths((prev) => new Set(prev).add(path));
    patchMutation.mutate({ path, action, oldValue, newValue, nextProfile: newProfile });
  }

  function handleConfirm(path: string) {
    if (!profile) return;
    const value = getByPath(profile, path);
    applyChange(path, "confirm", profile, value, value);
  }

  function handleEdit(path: string, newText: string) {
    if (!profile) return;
    const oldValue = getByPath(profile, path);
    const next = setByPath(profile, path, newText);
    applyChange(path, "edit", next, oldValue, newText);
  }

  function handleEditGroup(path: string, category: string, skills: string[]) {
    if (!profile) return;
    const oldValue = getByPath(profile, path);
    const current = oldValue as { category: string; skills: string[]; confidence: number; source_type: string; evidence: string | null };
    const newValue = { ...current, category, skills };
    const next = setByPath(profile, path, newValue);
    applyChange(path, "edit", next, oldValue, newValue);
  }

  function handleRemove(path: string) {
    if (!profile) return;
    const oldValue = getByPath(profile, path.replace(/\.text$/, ""));
    const arrayPath = path.replace(/\.text$/, "");
    const next = removeAtPath(profile, arrayPath);
    applyChange(path, "remove", next, oldValue, null);
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
      await candidatesApi.approveProfile(id);
      toast.success("Profile approved — choose a template to generate the CV.");
      router.push(`/candidates/${id}/generate`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const detail = err.detail as ApiErrorDetail;
        toast.error(detail.message || "Some fields still need review.");
        const firstPath = detail.unreviewed_paths?.[0];
        if (firstPath) {
          const el = document.getElementById(firstPath);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        toast.error(err instanceof ApiError ? err.message : "Couldn't approve this profile.");
      }
    } finally {
      setApproving(false);
    }
  }

  function saveHeader() {
    if (!profile) return;
    let next = setByPath(profile, "candidate.full_name", nameDraft);
    next = setByPath(next, "candidate.role_title", roleDraft);
    setProfile(next);
    patchMutation.mutate({
      path: "candidate.full_name",
      action: "edit",
      oldValue: profile.candidate.full_name,
      newValue: nameDraft,
      nextProfile: next,
    });
    setEditingHeader(false);
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Review profile" />
        <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-4">
          <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
        </main>
      </>
    );
  }

  if (isError || !profile) {
    return (
      <>
        <Topbar title="Review profile" />
        <main className="flex-1 p-6 max-w-3xl w-full mx-auto">
          <p className="text-sm text-danger">Couldn&apos;t load this candidate&apos;s profile.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Review profile" />
      <main className="flex-1 px-6 pt-0 pb-10 max-w-3xl w-full mx-auto">
        <ApproveBar
          totalFlagged={flagged.length}
          reviewedCount={reviewedCount}
          onApprove={handleApprove}
          onJumpToNext={jumpToNext}
          approving={approving}
          candidateName={profile.candidate.full_name}
        />

        {alreadyApproved && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-confidence-high/40 bg-confidence-high-soft px-4 py-2.5 text-[13px] text-confidence-high flex items-center justify-between">
            <span>This profile is already approved.</span>
            <Button size="sm" variant="secondary" onClick={() => router.push(`/candidates/${id}/generate`)}>
              Go to generate
            </Button>
          </div>
        )}

        {/* Candidate header */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 mb-6">
          {editingHeader ? (
            <div className="space-y-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Full name" />
              <Input value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} placeholder="Role title (cover page / header)" />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditingHeader(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveHeader}>
                  <Check className="h-3.5 w-3.5" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-text">{profile.candidate.full_name}</h2>
                <p className="text-sm text-accent font-medium mt-0.5">{profile.candidate.role_title}</p>
                <div className="flex items-center gap-4 mt-2.5 text-xs text-text-muted">
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
                  className="text-xs text-text-faint hover:text-text flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end mb-3">
          <button
            onClick={() => setExpandAll((s) => !s)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
          >
            {expandAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expandAll ? "Collapse reviewed fields" : "Expand all fields"}
          </button>
        </div>

        {/* Career summary */}
        <Section title="Career summary">
          <div className="space-y-1">
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
        <Section title="Technical skills">
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
        <Section title={profile.education.has_certifications ? "Educational qualifications & certifications" : "Educational qualifications"}>
          <div className="space-y-1">
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
        <Section title="Employment summary & projects">
          <div className="space-y-3">
            {profile.employment.map((job, ji) => (
              <EmploymentEntryCard
                key={ji}
                entry={job}
                index={ji}
                isReviewed={(p) => reviewedPaths.has(p)}
                onConfirm={(p) => handleConfirm(p)}
                onEditResponsibility={(ri, text) => handleEdit(`employment.${ji}.responsibilities.${ri}.text`, text)}
                onRemoveResponsibility={(ri) => handleRemove(`employment.${ji}.responsibilities.${ri}.text`)}
              />
            ))}
          </div>
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-3">{title}</h3>
      {children}
    </section>
  );
}