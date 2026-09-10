"use client";

import { use, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
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
  Bot,
  RotateCcw,
  Star,
  MoreVertical,
  FileText,
  Download,
  ChevronDown,
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

const ENHANCEMENT_OPTIONS: { level: BluffLevel; label: string; badge: string; desc: string }[] = [
  {
    level: "none",
    label: "Strict Facts",
    badge: "100% Verified",
    desc: "Strictly preserves source candidate facts without adding new details. Only standardizes formatting.",
  },
  {
    level: "low",
    label: "Role Focus",
    badge: "Conservative",
    desc: "Aligns existing experience and terminology to match target role requirements while staying strictly factual.",
  },
  {
    level: "medium",
    label: "Role Alignment",
    badge: "Recommended",
    desc: "Bridges adjacent skills and contextualizes achievements directly to the target job description.",
  },
  {
    level: "high",
    label: "Scope Expansion",
    badge: "Comprehensive",
    desc: "Expands bullet points to highlight broader leadership, enterprise impact, and stretch competencies.",
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
  const [approving, setApproving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [hasGeneratedDoc, setHasGeneratedDoc] = useState(false);

  // Candidate Header Edit state
  const [editingHeader, setEditingHeader] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");

  // Profile actions menu dropdown state
  const [openMenuProfileId, setOpenMenuProfileId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Unified "New Profile" modal state
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [newProfileTitle, setNewProfileTitle] = useState("");
  const [newProfileRole, setNewProfileRole] = useState("");
  const [newProfileContext, setNewProfileContext] = useState("");
  const [newProfileEnhancement, setNewProfileEnhancement] = useState<BluffLevel>("medium");
  const [creatingProfile, setCreatingProfile] = useState(false);

  // AI Agent Drawer state
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
  const [previousProfile, setPreviousProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    if (data) {
      setProfile(data.profile);
      setNameDraft(data.profile.candidate.full_name || "");
      setRoleDraft(data.profile.candidate.role_title || "");
      setEmailDraft(data.profile.candidate.email || "");
      setPhoneDraft(data.profile.candidate.phone || "");
      setLocationDraft(data.profile.candidate.location || "");
      if (!activeProfileId) {
        setActiveProfileId(data.profile_id);
      }
    }
  }, [data, activeProfileId]);

  // Click outside to close profile dropdown menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuProfileId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSwitchProfile(profileId: string) {
    setActiveProfileId(profileId);
    setOpenMenuProfileId(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("profileId", profileId);
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function handleSetMasterProfile(profileId: string) {
    try {
      await candidatesApi.setMasterProfile(id, profileId);
      await refetchProfiles();
      queryClient.invalidateQueries({ queryKey: ["candidate-profiles", id] });
      toast.success("Set as candidate's default profile.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to set default profile.");
    } finally {
      setOpenMenuProfileId(null);
    }
  }

  async function handleDuplicateProfile(baseProfileId?: string) {
    const baseId = baseProfileId || activeProfileId || data?.profile_id;
    const baseProfileObj = profilesData?.items.find((p) => p.id === baseId);
    const baseTitle = baseProfileObj?.title || data?.title || "Primary Profile";
    const duplicateTitle = `${baseTitle} (Copy)`;

    try {
      const res = await candidatesApi.cloneProfile(id, {
        title: duplicateTitle,
        base_profile_id: baseId,
      });
      await refetchProfiles();
      handleSwitchProfile(res.profile_id);
      toast.success(`Duplicated profile as "${res.title}"!`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to duplicate profile.");
    } finally {
      setOpenMenuProfileId(null);
    }
  }

  async function handleSaveRename() {
    if (!renameTargetId || !renameDraft.trim()) {
      setShowRenameModal(false);
      return;
    }
    try {
      await candidatesApi.updateProfileTitle(id, renameTargetId, renameDraft.trim());
      await refetchProfiles();
      queryClient.invalidateQueries({ queryKey: ["profile", id, renameTargetId] });
      toast.success("Profile title updated.");
    } catch {
      toast.error("Failed to update profile title.");
    } finally {
      setShowRenameModal(false);
      setRenameTargetId(null);
    }
  }

  async function handleCreateProfile() {
    if (!newProfileTitle.trim()) {
      toast.error("Please enter a title for the new profile.");
      return;
    }
    setCreatingProfile(true);
    try {
      let res;
      if (newProfileContext.trim()) {
        res = await candidatesApi.tailorProfile(id, {
          title: newProfileTitle.trim(),
          target_role: newProfileRole.trim() || undefined,
          job_description: newProfileContext.trim(),
          bluff_level: newProfileEnhancement,
          base_profile_id: activeProfileId || data?.profile_id,
        });
      } else {
        res = await candidatesApi.cloneProfile(id, {
          title: newProfileTitle.trim(),
          target_role: newProfileRole.trim() || undefined,
          base_profile_id: activeProfileId || data?.profile_id,
          bluff_level: newProfileEnhancement,
        });
      }
      await refetchProfiles();
      handleSwitchProfile(res.profile_id);
      setShowAddProfileModal(false);
      setNewProfileTitle("");
      setNewProfileRole("");
      setNewProfileContext("");
      toast.success(`Created "${res.title}" profile!`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create profile.");
    } finally {
      setCreatingProfile(false);
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
      toast.success("Profile deleted successfully.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete profile.");
    } finally {
      setOpenMenuProfileId(null);
    }
  }

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

  useEffect(() => {
    if (events) setReviewedPaths(new Set(events.map((e) => e.field_path)));
  }, [events]);

  const flagged = useMemo(() => (profile ? collectFlaggedFields(profile) : []), [profile]);
  const reviewedCount = flagged.filter((f) => reviewedPaths.has(f.path)).length;
  const isCurrentProfileApproved = data?.extraction_status === "approved";

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
    const targetProfileId = activeProfileId || data?.profile_id;
    try {
      const res = await candidatesApi.approveProfile(id, targetProfileId || undefined);
      toast.success(res.message || "Profile approved for export.");
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["profile", id, targetProfileId] });
      queryClient.invalidateQueries({ queryKey: ["candidate-profiles", id] });
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
    next = setByPath(next, "candidate.email", emailDraft.trim() || null);
    next = setByPath(next, "candidate.phone", phoneDraft.trim() || null);
    next = setByPath(next, "candidate.location", locationDraft.trim() || null);
    applyChange("candidate", "edit", next, profile.candidate, next.candidate);
    setEditingHeader(false);
    toast.success("Candidate contact & header updated.");
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Candidate Review & Studio" />
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-4">
          <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
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
        <Topbar title="Candidate Review & Studio" />
        <main className="flex-1 p-6 max-w-3xl w-full mx-auto">
          <p className="text-sm text-danger">Couldn&apos;t load this candidate&apos;s profile.</p>
        </main>
      </>
    );
  }

  const activeProfile = profilesData?.items.find(
    (p) => p.id === (activeProfileId || data?.profile_id)
  );

  return (
    <>
      <Topbar title="Candidate Review & Studio" />
      <main className="flex-1 px-6 pt-0 pb-12 max-w-7xl w-full mx-auto">
        <ApproveBar
          totalFlagged={flagged.length}
          reviewedCount={reviewedCount}
          onApprove={handleApprove}
          onJumpToNext={jumpToNext}
          approving={approving}
          candidateName={profile.candidate.full_name}
          profileTitle={data?.title || "Primary Profile"}
          alreadyApproved={isCurrentProfileApproved}
          isDirty={isDirty}
        />

        {/* Streamlined Profile Navigation Bar */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2 mb-4 shadow-xs">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Profile Tab Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-text-faint mr-1 flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-accent" /> Profiles:
              </span>

              {profilesData?.items && profilesData.items.length > 0 ? (
                profilesData.items.map((p) => {
                  const isActive = p.id === (activeProfileId || data?.profile_id);
                  const isMenuOpen = openMenuProfileId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "relative inline-flex items-stretch rounded-[var(--radius-sm)] border text-xs font-medium transition-all shadow-2xs",
                        isActive
                          ? "bg-accent border-accent text-white font-semibold shadow-xs"
                          : "bg-bg-elevated border-border text-text-muted hover:text-text hover:bg-surface-hover"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSwitchProfile(p.id)}
                        className="pl-2.5 pr-2 py-1 flex items-center gap-1.5 cursor-pointer rounded-l-[var(--radius-sm)] focus:outline-none"
                      >
                        <span className="truncate max-w-[150px]">{p.title}</span>
                        {p.is_master && (
                          <span
                            className={cn(
                              "text-[9px] px-1 py-0.2 rounded font-semibold uppercase tracking-wider",
                              isActive
                                ? "bg-white/20 text-white"
                                : "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                            )}
                            title="Default master profile for candidate"
                          >
                            ★ Default
                          </span>
                        )}
                        {p.extraction_status === "approved" && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1 rounded",
                              isActive ? "bg-emerald-400/20 text-emerald-100" : "text-emerald-500"
                            )}
                            title="Approved for export"
                          >
                            ✓
                          </span>
                        )}
                      </button>

                      {/* Dropdown menu trigger integrated directly into the pill */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuProfileId(isMenuOpen ? null : p.id);
                        }}
                        className={cn(
                          "px-1.5 flex items-center justify-center cursor-pointer border-l transition-colors rounded-r-[var(--radius-sm)] focus:outline-none",
                          isActive
                            ? "border-white/25 text-white/90 hover:bg-white/20 hover:text-white"
                            : "border-border text-text-faint hover:text-text hover:bg-surface"
                        )}
                        title="Profile options (Rename, Set Default, Duplicate, Delete)"
                        aria-label="Profile options"
                        aria-expanded={isMenuOpen}
                      >
                        <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", isMenuOpen && "rotate-180")} />
                      </button>

                      {/* Dropdown Menu Popup */}
                      {isMenuOpen && (
                        <div
                          ref={menuRef}
                          className="absolute left-0 top-full mt-1.5 z-40 w-48 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl animate-fade-in"
                        >
                          <button
                            onClick={() => {
                              setRenameTargetId(p.id);
                              setRenameDraft(p.title);
                              setShowRenameModal(true);
                              setOpenMenuProfileId(null);
                            }}
                            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                          >
                            <Pencil className="h-3 w-3 text-text-faint" />
                            <span>Rename Profile</span>
                          </button>

                          <button
                            onClick={() => handleDuplicateProfile(p.id)}
                            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                          >
                            <Copy className="h-3 w-3 text-text-faint" />
                            <span>Duplicate Profile</span>
                          </button>

                          {!p.is_master && (
                            <button
                              onClick={() => handleSetMasterProfile(p.id)}
                              className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                            >
                              <Star className="h-3 w-3 text-amber-500" />
                              <span>Set as Default</span>
                            </button>
                          )}

                          {profilesData.items.length > 1 && (
                            <button
                              onClick={() => handleDeleteProfile(p.id)}
                              className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-xs text-danger hover:bg-danger-soft rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete Profile</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <span className="px-3 py-1 rounded-[var(--radius-sm)] text-xs font-semibold bg-accent text-white">
                  {data?.title || "Primary Profile"} ★ Default
                </span>
              )}

              {/* Single Clean Add Profile Trigger */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewProfileTitle(
                    `${profile?.candidate?.role_title || data?.title || "Profile"} (Variation)`
                  );
                  setNewProfileRole(profile?.candidate?.role_title || "");
                  setNewProfileContext("");
                  setNewProfileEnhancement("medium");
                  setShowAddProfileModal(true);
                }}
                className="text-xs h-7 px-2.5 text-accent hover:text-accent-strong hover:bg-accent-soft"
                title="Create or align a new candidate profile"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> New Profile
              </Button>
            </div>

            {/* Quick Actions for Current Profile */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDuplicateProfile()}
                className="text-xs h-7 px-2 text-text-muted hover:text-text hover:bg-bg-elevated"
                title="Quick 1-click duplicate of current profile"
              >
                <Copy className="h-3 w-3 mr-1 text-text-faint" /> Duplicate
              </Button>

              {activeProfile?.is_master ? (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Default Profile
                </span>
              ) : (
                <button
                  onClick={() => data?.profile_id && handleSetMasterProfile(data.profile_id)}
                  className="text-[11px] text-text-faint hover:text-text hover:bg-bg-elevated px-2 py-0.5 rounded border border-border/80 transition-colors cursor-pointer"
                  title="Make this profile open by default for this candidate"
                >
                  Set as Default
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Studio Workspace Header & Actions */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Active Profile:</span>
            <span className="text-xs font-bold text-text">{data?.title || "Primary Profile"}</span>
            {data?.bluff_level && data.bluff_level !== "none" && (
              <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                {data.bluff_level === "low" ? "Role Focus" : data.bluff_level === "medium" ? "Role Alignment" : "Scope Expansion"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowAgentDrawer(true)}
              className="text-xs h-8 px-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-accent hover:from-purple-500 hover:to-accent text-white font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Open AI Resume Consultant to discuss or modify this candidate"
            >
              <Bot className="h-4 w-4" />
              <span>AI Consultant</span>
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
                <span>Undo Edit</span>
              </Button>
            )}

            <Button
              variant={showPreview ? "outline" : "default"}
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs h-8 font-semibold"
            >
              {showPreview ? (
                <>
                  <PanelRightClose className="h-3.5 w-3.5 mr-1.5" />
                  Hide Document Preview
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  {hasGeneratedDoc ? "Update Resume" : "Generate Resume"}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Split Studio Layout */}
        <div className={`grid grid-cols-1 ${showPreview ? "xl:grid-cols-12 gap-8" : "max-w-4xl mx-auto"} items-start`}>
          {/* Left Column: Candidate Structured Editor */}
          <div className={`${showPreview ? "xl:col-span-7" : "w-full"} space-y-6`}>
            {/* Candidate Identity & Contact Header Card */}
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-xs">
              {editingHeader ? (
                <div className="space-y-3.5 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-text-muted mb-1 block">Full Name</label>
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        placeholder="Candidate full name"
                        className="text-xs h-9 bg-bg"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-text-muted mb-1 block">
                        Target Professional Title
                      </label>
                      <Input
                        value={roleDraft}
                        onChange={(e) => setRoleDraft(e.target.value)}
                        placeholder="e.g. Senior Software Engineer"
                        className="text-xs h-9 bg-bg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-text-muted mb-1 block">Email Address</label>
                      <Input
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        placeholder="candidate@example.com"
                        className="text-xs h-9 bg-bg"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-text-muted mb-1 block">Phone Number</label>
                      <Input
                        value={phoneDraft}
                        onChange={(e) => setPhoneDraft(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="text-xs h-9 bg-bg"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-text-muted mb-1 block">Location</label>
                      <Input
                        value={locationDraft}
                        onChange={(e) => setLocationDraft(e.target.value)}
                        placeholder="City, Country"
                        className="text-xs h-9 bg-bg"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-1 border-t border-border">
                    <Button variant="ghost" size="sm" onClick={() => setEditingHeader(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveHeader} className="font-semibold text-xs">
                      <Check className="h-3.5 w-3.5 mr-1" /> Save Contact & Details
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-text tracking-tight">{profile.candidate.full_name}</h2>
                    <p className="text-sm text-accent font-semibold">{profile.candidate.role_title}</p>
                    <div className="flex items-center gap-4 pt-1.5 text-xs text-text-muted flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-text-faint" />
                        {profile.candidate.email || <span className="italic text-text-faint">No email added</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-text-faint" />
                        {profile.candidate.phone || <span className="italic text-text-faint">No phone added</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-text-faint" />
                        {profile.candidate.location || <span className="italic text-text-faint">No location added</span>}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <ConfidenceBadge confidence={profile.meta.overall_confidence} />
                    <button
                      onClick={() => {
                        setNameDraft(profile.candidate.full_name || "");
                        setRoleDraft(profile.candidate.role_title || "");
                        setEmailDraft(profile.candidate.email || "");
                        setPhoneDraft(profile.candidate.phone || "");
                        setLocationDraft(profile.candidate.location || "");
                        setEditingHeader(true);
                      }}
                      className="text-xs text-text-faint hover:text-text flex items-center gap-1 p-1 rounded hover:bg-surface-hover transition-colors cursor-pointer"
                      title="Edit candidate contact details"
                    >
                      <Pencil className="h-3 w-3" /> Edit Info
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Career Summary */}
            <Section title="Career Summary">
              <div className="space-y-1.5 bg-surface rounded-[var(--radius-lg)] border border-border p-4 shadow-xs">
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
                      onConfirm={() => handleConfirm(path)}
                      onEdit={(t) => handleEdit(path, t)}
                      onRemove={() => handleRemove(path)}
                    />
                  );
                })}
              </div>
            </Section>

            {/* Technical Capabilities */}
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

            {/* Educational Qualifications & Certifications */}
            <Section
              title={
                profile.education.has_certifications
                  ? "Educational Qualifications & Certifications"
                  : "Educational Qualifications"
              }
            >
              <div className="space-y-1.5 bg-surface rounded-[var(--radius-lg)] border border-border p-4 shadow-xs">
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
                      onConfirm={() => handleConfirm(path)}
                      onEdit={(t) => handleEdit(path, t)}
                      onRemove={() => handleRemove(path)}
                    />
                  );
                })}
              </div>
            </Section>

            {/* Employment Summary & Client Projects */}
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
                profileId={data?.profile_id || activeProfileId || undefined}
                profileTitle={data?.title || "Primary Profile"}
                onClose={() => setShowPreview(false)}
                onGenerationChange={setHasGeneratedDoc}
              />
            </div>
          )}
        </div>

        {/* Unified "New Profile" Creation & Alignment Modal */}
        {showAddProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in overflow-y-auto">
            <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text">Create Candidate Profile</h3>
                    <p className="text-xs text-text-muted">Create a tailored version or targeted variation for this candidate</p>
                  </div>
                </div>
                <button
                  onClick={() => !creatingProfile && setShowAddProfileModal(false)}
                  disabled={creatingProfile}
                  className="p-1 rounded text-text-faint hover:text-text cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1">
                      Profile Title <span className="text-accent">*</span>
                    </label>
                    <Input
                      value={newProfileTitle}
                      onChange={(e) => setNewProfileTitle(e.target.value)}
                      placeholder="e.g. Full Stack - FinTech Focus"
                      className="text-xs h-9 bg-bg"
                      disabled={creatingProfile}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1">
                      Target Role Title (Optional)
                    </label>
                    <Input
                      value={newProfileRole}
                      onChange={(e) => setNewProfileRole(e.target.value)}
                      placeholder="Leave blank to inherit"
                      className="text-xs h-9 bg-bg"
                      disabled={creatingProfile}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Alignment Context & Guidelines (Optional)
                  </label>
                  <Textarea
                    value={newProfileContext}
                    onChange={(e) => setNewProfileContext(e.target.value)}
                    placeholder="Paste a target job description, key role requirements, or specific positioning guidelines (e.g. 'Highlight AWS and Kubernetes leadership'). Leave empty to duplicate directly."
                    rows={4}
                    className="text-xs bg-bg"
                    disabled={creatingProfile}
                  />
                  <p className="text-[11px] text-text-faint mt-1">
                    If provided, AI will optimize phrasing and skill emphasis against this context.
                  </p>
                </div>

                {newProfileContext.trim() && (
                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1.5">
                      Tailoring & Role Alignment Level
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ENHANCEMENT_OPTIONS.map((opt) => {
                        const selected = newProfileEnhancement === opt.level;
                        return (
                          <button
                            key={opt.level}
                            type="button"
                            onClick={() => setNewProfileEnhancement(opt.level)}
                            disabled={creatingProfile}
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
                                    ? "bg-purple-600 text-white"
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
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddProfileModal(false)}
                  disabled={creatingProfile}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateProfile}
                  disabled={creatingProfile || !newProfileTitle.trim()}
                  className="text-xs font-semibold"
                >
                  {creatingProfile ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Creating Profile...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {newProfileContext.trim() ? "Generate Aligned Profile" : "Create Profile"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Rename Profile Modal */}
        {showRenameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-text">Rename Profile</h4>
                <button
                  onClick={() => setShowRenameModal(false)}
                  className="p-1 rounded text-text-faint hover:text-text cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveRename();
                  if (e.key === "Escape") setShowRenameModal(false);
                }}
                placeholder="Profile title..."
                autoFocus
                className="text-xs h-9 bg-bg"
              />
              <div className="flex justify-end gap-2 pt-1 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setShowRenameModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveRename} className="text-xs font-semibold">
                  Save Title
                </Button>
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