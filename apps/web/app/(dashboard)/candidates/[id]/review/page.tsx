"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  MapPin,
  Pencil,
  Check,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  Plus,
  Trash2,
  X,
  Copy,
  Wand2,
  AlertTriangle,
  Bot,
  RotateCcw,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import {
  ApproveBar,
  ConfidenceBadge,
  ReviewableBullet,
  SkillGroupCard,
  EmploymentEntryCard,
  PreviewPanel,
  AIAgentDrawer,
} from "@/components/review";
import { candidatesApi, ApiError } from "@/lib/api-client";
import { getByPath, setByPath, removeAtPath, collectFlaggedFields } from "@/lib/profile-utils";
import type { CandidateProfile, EmploymentEntry, BluffLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const BLUFF_OPTIONS: { level: BluffLevel; label: string; badge: string; desc: string }[] = [
  {
    level: "none",
    label: "Strict Fact Match",
    badge: "0% Bluff",
    desc: "Strictly preserves verified facts; only keywords & phrasing are aligned to the JD.",
  },
  {
    level: "low",
    label: "Conservative",
    badge: "Low Bluff",
    desc: "Extrapolates related tools and standard engineering practices closely tied to source.",
  },
  {
    level: "medium",
    label: "Balanced",
    badge: "Recommended",
    desc: "Re-frames experience to match JD requirements and bridges minor tech stack gaps.",
  },
  {
    level: "high",
    label: "Aggressive / Bold",
    badge: "High Bluff",
    desc: "Maximizes JD match by generating relevant achievements and deep tech stack alignment.",
  },
];

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("profileId");
    }
    return null;
  });

  const { data: profilesData, refetch: refetchProfiles } = useQuery({
    queryKey: ["candidate-profiles", id],
    queryFn: () => candidatesApi.listProfiles(id),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile", id, activeProfileId],
    queryFn: () => candidatesApi.getProfile(id, activeProfileId || undefined),
  });

  const { data: events } = useQuery({
    queryKey: ["review-events", id, activeProfileId || data?.profile_id],
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

  // Profile title editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Clone profile modal state
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState("");
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    if (data) {
      setProfile(data.profile);
      setNameDraft(data.profile.candidate.full_name || "");
      setRoleDraft(data.profile.candidate.role_title || "");
      setTitleDraft(data.title || "Primary Profile");
      if (!activeProfileId) {
        setActiveProfileId(data.profile_id);
      }
    }
  }, [data, activeProfileId]);

  function handleSwitchProfile(profileId: string) {
    setActiveProfileId(profileId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("profileId", profileId);
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function handleSaveTitle() {
    if (!data?.profile_id || !titleDraft.trim()) {
      setEditingTitle(false);
      return;
    }
    try {
      await candidatesApi.updateProfileTitle(id, data.profile_id, titleDraft.trim());
      await refetchProfiles();
      queryClient.invalidateQueries({ queryKey: ["profile", id, data.profile_id] });
      toast.success("Profile title updated.");
    } catch {
      toast.error("Failed to update profile title.");
    } finally {
      setEditingTitle(false);
    }
  }

  // Tailor profile modal state
  const [showTailorModal, setShowTailorModal] = useState(false);
  const [tailorTitle, setTailorTitle] = useState("");
  const [tailorTargetRole, setTailorTargetRole] = useState("");
  const [tailorJobDescription, setTailorJobDescription] = useState("");
  const [tailorPrompt, setTailorPrompt] = useState("");
  const [tailorBluffLevel, setTailorBluffLevel] = useState<BluffLevel>("medium");
  const [tailoring, setTailoring] = useState(false);

  // AI Agent Drawer state
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
  const [previousProfile, setPreviousProfile] = useState<CandidateProfile | null>(null);

  function handleProfileUpdatedByAgent(newProfile: CandidateProfile) {
    if (profile) {
      setPreviousProfile(profile);
    }
    setProfile(newProfile);
    queryClient.invalidateQueries({ queryKey: ["profile", id, activeProfileId] });
  }

  async function handleUndoAgentEdit() {
    if (!previousProfile || !data?.profile_id) return;
    const toRestore = previousProfile;
    setPreviousProfile(null);
    setProfile(toRestore);
    try {
      await candidatesApi.patchProfile(
        id,
        {
          field_path: "ai_agent_undo",
          action: "edit",
          old_value: "AI Agent edits",
          new_value: "Reverted to previous state",
          profile: toRestore,
        },
        data.profile_id
      );
      queryClient.invalidateQueries({ queryKey: ["profile", id, activeProfileId] });
      toast.success("Reverted to previous profile state.");
    } catch {
      toast.error("Failed to persist reverted state.");
    }
  }

  async function handleCloneProfile() {
    if (!newTitle.trim()) {
      toast.error("Please provide a title for the new profile.");
      return;
    }
    setCloning(true);
    try {
      const res = await candidatesApi.cloneProfile(id, {
        title: newTitle.trim(),
        target_role: newRole.trim() || undefined,
        base_profile_id: data?.profile_id,
      });
      await refetchProfiles();
      handleSwitchProfile(res.profile_id);
      setShowCloneModal(false);
      setNewTitle("");
      setNewRole("");
      toast.success(`Created "${res.title}" profile!`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create profile version.");
    } finally {
      setCloning(false);
    }
  }

  async function handleTailorProfile() {
    if (!tailorTitle.trim()) {
      toast.error("Please provide a title for the tailored profile.");
      return;
    }
    if (!tailorJobDescription.trim()) {
      toast.error("Please paste the target job description.");
      return;
    }
    setTailoring(true);
    try {
      const res = await candidatesApi.tailorProfile(id, {
        title: tailorTitle.trim(),
        target_role: tailorTargetRole.trim() || undefined,
        job_description: tailorJobDescription.trim(),
        custom_prompt: tailorPrompt.trim() || undefined,
        bluff_level: tailorBluffLevel,
        base_profile_id: data?.profile_id,
      });
      await refetchProfiles();
      handleSwitchProfile(res.profile_id);
      setShowTailorModal(false);
      setTailorJobDescription("");
      setTailorPrompt("");
      toast.success(`Generated tailored profile "${res.title}"!`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to tailor profile.");
    } finally {
      setTailoring(false);
    }
  }

  async function handleDeleteProfile(profileId: string) {
    if (!confirm("Are you sure you want to delete this profile version?")) return;
    try {
      await candidatesApi.deleteProfile(id, profileId);
      await refetchProfiles();
      setActiveProfileId(null);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("profileId");
        window.history.replaceState(null, "", url.toString());
      }
      queryClient.invalidateQueries({ queryKey: ["profile", id] });
      toast.success("Profile version deleted.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete profile.");
    }
  }

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
      candidatesApi.patchProfile(
        id,
        {
          field_path: vars.path,
          action: vars.action,
          old_value: vars.oldValue,
          new_value: vars.newValue,
          profile: vars.nextProfile,
        },
        activeProfileId || data?.profile_id
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", id, activeProfileId || data?.profile_id] });
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

        {/* Multi-Profile Switcher Bar */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3 mb-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Profile Selection Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-faint mr-1 flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-accent" /> Profiles:
              </span>

              {profilesData?.items && profilesData.items.length > 0 ? (
                profilesData.items.map((p) => {
                  const isActive = p.id === (activeProfileId || data?.profile_id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchProfile(p.id)}
                      className={cn(
                        "px-3 py-1 rounded-[var(--radius-sm)] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                        isActive
                          ? "bg-accent text-white shadow-sm"
                          : "bg-bg-elevated hover:bg-surface-hover text-text-muted hover:text-text border border-border"
                      )}
                    >
                      <span>{p.title}</span>
                      {p.is_master && <span className="opacity-80 text-[10px]">★</span>}
                      {p.bluff_level && p.bluff_level !== "none" && (
                        <span
                          className={cn(
                            "text-[10px] px-1 rounded font-normal",
                            isActive ? "bg-white/20 text-white" : "bg-purple-500/10 text-purple-400"
                          )}
                        >
                          {p.bluff_level}
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <span className="px-3 py-1 rounded-[var(--radius-sm)] text-xs font-semibold bg-accent text-white">
                  {data?.title || "Primary Profile"} ★
                </span>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewTitle(`${data?.title || "Primary Profile"} (Variation)`);
                  setNewRole(profile.candidate.role_title || "");
                  setShowCloneModal(true);
                }}
                className="text-xs h-7 px-2.5 text-accent hover:text-accent-strong hover:bg-accent-soft"
                title="Create a new profile version for this candidate"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> New Version
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setTailorTitle(
                    `${profile?.candidate?.role_title || data?.title || "Role"} - Tailored`
                  );
                  setTailorTargetRole(profile?.candidate?.role_title || "");
                  setTailorJobDescription("");
                  setTailorPrompt("");
                  setTailorBluffLevel("medium");
                  setShowTailorModal(true);
                }}
                className="text-xs h-7 px-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium shadow-xs"
                title="Generate an AI-tailored profile for a Job Description with controlled bluff"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1 text-purple-200" /> Tailor with AI
              </Button>
            </div>

            {/* Active Profile Title Inline Editor & Actions */}
            <div className="flex items-center gap-2">
              {data?.bluff_level && data.bluff_level !== "none" && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-xs">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Bluff: {data.bluff_level.toUpperCase()}
                </span>
              )}
              {data?.target_role && (
                <span className="text-[11px] text-text-muted bg-surface px-2 py-0.5 rounded border border-border hidden md:inline-block">
                  Target: {data.target_role}
                </span>
              )}

              {editingTitle ? (
                <div className="flex items-center gap-1.5 animate-fade-in">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    autoFocus
                    className="h-7 text-xs w-48 bg-surface"
                    placeholder="Profile title..."
                  />
                  <Button size="sm" onClick={handleSaveTitle} className="h-7 px-2 text-xs font-medium">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTitle(false)}
                    className="h-7 px-2 text-xs"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-bg-elevated/70 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border">
                  <span className="text-xs text-text-faint">Active:</span>
                  <span className="text-xs font-semibold text-text truncate max-w-[200px]" title={data?.title || "Primary Profile"}>
                    {data?.title || "Primary Profile"}
                  </span>
                  <button
                    onClick={() => {
                      setTitleDraft(data?.title || "Primary Profile");
                      setEditingTitle(true);
                    }}
                    className="p-1 rounded text-text-faint hover:text-text hover:bg-surface transition-colors cursor-pointer"
                    title="Rename this profile title"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>

                  {profilesData?.items && profilesData.items.length > 1 && (
                    <button
                      onClick={() => data?.profile_id && handleDeleteProfile(data.profile_id)}
                      className="p-1 rounded text-text-faint hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer ml-1"
                      title="Delete this profile version"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Studio View Mode Bar */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">
              Workspace View: <span className="text-text font-semibold">{showPreview ? "Split Studio" : "Full-Width Editor"}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowAgentDrawer(true)}
              className="text-xs h-8 px-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-accent hover:from-purple-500 hover:to-accent text-white font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Open AI Profile Copilot to chat and modify this CV"
            >
              <Bot className="h-4 w-4" />
              <span>AI Copilot</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </Button>

            {previousProfile && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndoAgentEdit}
                className="text-xs h-8 px-2.5 text-text-muted hover:text-text border-border hover:bg-surface-hover flex items-center gap-1"
                title="Revert the last AI change"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Undo AI Edit</span>
              </Button>
            )}

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
                      sourceType={g.source_type}
                      evidence={g.evidence}
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

        {/* Clone / New Profile Modal */}
        {showCloneModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Copy className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-text">New Profile Version</h3>
                </div>
                <button
                  onClick={() => setShowCloneModal(false)}
                  className="p-1 rounded text-text-faint hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-text-muted leading-relaxed">
                Create a distinct version of this candidate&apos;s CV tailored for a specific role or industry. All base verified facts will be preserved.
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Profile Title (e.g. Senior Backend - Fintech)
                  </label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Full Stack Tech Lead"
                    autoFocus
                    className="text-xs h-9 bg-bg"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Target Role Title (optional, for cover page)
                  </label>
                  <Input
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="e.g. Staff Software Engineer"
                    className="text-xs h-9 bg-bg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCloneModal(false)}
                  disabled={cloning}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCloneProfile}
                  disabled={cloning || !newTitle.trim()}
                  className="text-xs font-semibold"
                >
                  {cloning ? "Creating..." : "Create Profile Version"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tailor with AI Modal */}
        {showTailorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in overflow-y-auto">
            <div className="w-full max-w-xl rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Wand2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text">Tailor Profile for Target Job</h3>
                    <p className="text-xs text-text-muted">AI-powered JD alignment with fine-grained bluff control</p>
                  </div>
                </div>
                <button
                  onClick={() => !tailoring && setShowTailorModal(false)}
                  disabled={tailoring}
                  className="p-1 rounded text-text-faint hover:text-text cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1">
                      New Profile Title <span className="text-accent">*</span>
                    </label>
                    <Input
                      value={tailorTitle}
                      onChange={(e) => setTailorTitle(e.target.value)}
                      placeholder="e.g. Lead Backend - Fintech"
                      className="text-xs h-9 bg-bg"
                      disabled={tailoring}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1">
                      Target Role Title (Cover page)
                    </label>
                    <Input
                      value={tailorTargetRole}
                      onChange={(e) => setTailorTargetRole(e.target.value)}
                      placeholder="e.g. Staff Software Engineer"
                      className="text-xs h-9 bg-bg"
                      disabled={tailoring}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Target Job Description (JD) <span className="text-accent">*</span>
                  </label>
                  <Textarea
                    value={tailorJobDescription}
                    onChange={(e) => setTailorJobDescription(e.target.value)}
                    placeholder="Paste requirements, tech stack, responsibilities, or role description..."
                    rows={4}
                    className="text-xs bg-bg"
                    disabled={tailoring}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1.5">
                    Controlled Bluff / Creativity Level
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BLUFF_OPTIONS.map((opt) => {
                      const selected = tailorBluffLevel === opt.level;
                      return (
                        <button
                          key={opt.level}
                          type="button"
                          onClick={() => setTailorBluffLevel(opt.level)}
                          disabled={tailoring}
                          className={cn(
                            "text-left p-2.5 rounded-[var(--radius-md)] border transition-all cursor-pointer",
                            selected
                              ? "border-purple-500 bg-purple-500/10 shadow-xs"
                              : "border-border bg-bg/50 hover:border-border-strong hover:bg-bg"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold text-text">{opt.label}</span>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                selected
                                  ? "bg-purple-500 text-white"
                                  : "bg-surface text-text-muted border border-border"
                              )}
                            >
                              {opt.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted leading-tight">{opt.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Custom Prompt / Focus Instructions (optional)
                  </label>
                  <Textarea
                    value={tailorPrompt}
                    onChange={(e) => setTailorPrompt(e.target.value)}
                    placeholder='e.g. "Highlight AWS serverless architecture and microservices leadership. Tone down legacy PHP experience."'
                    rows={2}
                    className="text-xs bg-bg"
                    disabled={tailoring}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                <p className="text-[11px] text-text-faint">
                  {tailorBluffLevel !== "none" ? "Extrapolated items will be marked with clear visual badges in review." : "Strictly verified facts only."}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTailorModal(false)}
                    disabled={tailoring}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleTailorProfile}
                    disabled={tailoring || !tailorTitle.trim() || !tailorJobDescription.trim()}
                    className="text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xs"
                  >
                    {tailoring ? (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Tailoring with AI...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generate Tailored Profile
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Agent Drawer */}
        <AIAgentDrawer
          candidateId={id}
          profileId={data?.profile_id || activeProfileId || ""}
          candidateName={profile.candidate.full_name}
          profileTitle={data?.title || "Primary Profile"}
          isOpen={showAgentDrawer}
          onClose={() => setShowAgentDrawer(false)}
          onProfileUpdated={handleProfileUpdatedByAgent}
          onUndo={handleUndoAgentEdit}
          canUndo={!!previousProfile}
        />
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