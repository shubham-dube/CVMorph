"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
  FileText,
  FileEdit,
  Sparkles,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/layout/Topbar";
import { Dropzone } from "@/components/upload/Dropzone";
import { StageStepper, type Stage } from "@/components/upload/StageStepper";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { documentsApi, candidatesApi, pollJob, ApiError } from "@/lib/api-client";
import type { JobStatus, BluffLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGES: Stage[] = [
  { key: "uploading", label: "Uploading" },
  { key: "parsing", label: "Parsing text" },
  { key: "extracting", label: "AI extracting" },
  { key: "ready", label: "Ready for review" },
];

const ALIGNMENT_OPTIONS: { level: BluffLevel; label: string; badge: string; desc: string }[] = [
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

function stageIndexFor(status: JobStatus): number {
  if (status === "queued") return 0;
  if (status === "parsing" || status === "processing" || status === "retrying") return 1;
  if (status === "extracting" || status === "parsed") return 2;
  if (status === "ready_for_review" || status === "complete" || status === "success") return 3;
  return 0;
}

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"file" | "text">("file");

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [submittingFile, setSubmittingFile] = useState(false);
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Direct text state
  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [rawText, setRawText] = useState("");

  // Optional intake tailoring
  const [enableTailoring, setEnableTailoring] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [bluffLevel, setBluffLevel] = useState<BluffLevel>("none");
  const [customPrompt, setCustomPrompt] = useState("");
  const [submittingText, setSubmittingText] = useState(false);

  async function handleFileUpload() {
    if (!file) return;
    setSubmittingFile(true);
    setFailed(null);
    setStageIndex(0);
    try {
      const upload = await documentsApi.upload(file, {
        extractionInstructions: instructions.trim() || undefined,
      });
      await pollJob(upload.job_id, (status) => setStageIndex(stageIndexFor(status)));
      setStageIndex(STAGES.length - 1);
      toast.success("CV extracted — ready for your review.");
      router.push(`/candidates/${upload.candidate_id}/review`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Upload failed. Please try again.";
      setFailed(message);
      toast.error(message);
    } finally {
      setSubmittingFile(false);
    }
  }

  async function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Please enter the candidate's full name.");
      return;
    }
    if (!rawText.trim()) {
      toast.error("Please provide the candidate's background text or resume content.");
      return;
    }

    setSubmittingText(true);
    try {
      const res = await candidatesApi.createFromText({
        full_name: fullName.trim(),
        role_title: roleTitle.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        location: location.trim() || undefined,
        raw_text: rawText.trim(),
        target_role: enableTailoring ? targetRole.trim() || undefined : undefined,
        job_description: enableTailoring ? jobDescription.trim() || undefined : undefined,
        bluff_level: enableTailoring ? bluffLevel : "none",
        custom_prompt: enableTailoring ? customPrompt.trim() || undefined : undefined,
      });

      toast.success(`Candidate profile generated for ${res.profile.candidate.full_name}!`);
      router.push(`/candidates/${res.candidate_id}/review?profileId=${res.profile_id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create profile from text.";
      toast.error(message);
    } finally {
      setSubmittingText(false);
    }
  }

  return (
    <>
      <Topbar title="Create Candidate Profile" />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-6">
        {/* Mode Selector Tabs */}
        <div className="flex rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-[var(--radius-sm)] transition-all cursor-pointer",
              mode === "file"
                ? "bg-accent text-white shadow-xs"
                : "text-text-muted hover:text-text hover:bg-surface-hover"
            )}
          >
            <FileText className="h-4 w-4" />
            Upload Document (PDF / DOCX)
          </button>
          <button
            type="button"
            onClick={() => setMode("text")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-[var(--radius-sm)] transition-all cursor-pointer",
              mode === "text"
                ? "bg-accent text-white shadow-xs"
                : "text-text-muted hover:text-text hover:bg-surface-hover"
            )}
          >
            <FileEdit className="h-4 w-4" />
            Direct Text / Form Input
          </button>
        </div>

        {mode === "file" ? (
          stageIndex === null ? (
            <div className="space-y-5">
              <p className="text-sm text-text-muted">
                Drop in a candidate&apos;s CV — any layout, PDF or DOCX. We&apos;ll extract the details and
                hand it to you for a quick review before anything gets formatted.
              </p>

              <Dropzone file={file} onFileSelected={setFile} onClear={() => setFile(null)} />

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowInstructions((s) => !s)}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text cursor-pointer"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Add instructions for this CV
                  {showInstructions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showInstructions && (
                  <div className="mt-2.5 animate-fade-in">
                    <Textarea
                      placeholder='e.g. "Use the most recent job title, not the CV header" or "Ignore the personal projects section"'
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={3}
                    />
                    <p className="text-xs text-text-faint mt-1.5">
                      Guides how the AI reads this specific CV. It can never introduce facts that
                      aren&apos;t in the source document.
                    </p>
                  </div>
                )}
              </div>

              <Button
                className="w-full mt-6"
                size="lg"
                disabled={!file || submittingFile}
                onClick={handleFileUpload}
              >
                {submittingFile ? "Uploading & extracting..." : "Extract candidate profile"}
              </Button>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-8 pb-8">
                <StageStepper stages={STAGES} currentIndex={stageIndex} failed={!!failed} />
                {failed && (
                  <div className="mt-8 text-center">
                    <p className="text-sm text-danger mb-4">{failed}</p>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setStageIndex(null);
                        setFailed(null);
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        ) : (
          /* Direct Text / Form Input Mode */
          <form onSubmit={handleTextSubmit} className="space-y-6">
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-4 shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-text">Candidate Identity & Core Details</h3>
                <p className="text-xs text-text-muted">
                  Provide candidate information directly without needing an uploaded document.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Full Name <span className="text-accent">*</span>
                  </label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Eleanor Vance"
                    required
                    className="text-xs h-9 bg-bg"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Current or Target Role Title
                  </label>
                  <Input
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder="e.g. Lead Solutions Architect"
                    className="text-xs h-9 bg-bg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="eleanor@example.com"
                    className="text-xs h-9 bg-bg"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Phone Number
                  </label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="text-xs h-9 bg-bg"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    Location
                  </label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="San Francisco, CA"
                    className="text-xs h-9 bg-bg"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-muted block mb-1">
                  Candidate Experience & Resume Text <span className="text-accent">*</span>
                </label>
                <Textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste work experience, bullet points, skills, education, career summaries, or LinkedIn bio here..."
                  rows={8}
                  required
                  className="text-xs bg-bg font-mono leading-relaxed"
                />
                <p className="text-[11px] text-text-faint mt-1">
                  You can paste unstructured notes, raw bullet points, or complete CV text. Our AI will normalize everything into our canonical profile format.
                </p>
              </div>
            </div>

            {/* Optional Immediate JD Tailoring */}
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-bold text-text">Target Role Alignment & JD (Optional)</h3>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text-muted hover:text-text">
                  <input
                    type="checkbox"
                    checked={enableTailoring}
                    onChange={(e) => setEnableTailoring(e.target.checked)}
                    className="rounded border-border accent-accent h-4 w-4"
                  />
                  <span>Enable Role Alignment & Phrasing</span>
                </label>
              </div>

              {enableTailoring && (
                <div className="space-y-4 pt-2 border-t border-border animate-fade-in">
                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1">
                      Target Role Title (Optional)
                    </label>
                    <Input
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="e.g. Senior Staff Platform Engineer"
                      className="text-xs h-9 bg-bg"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1">
                      Alignment Context & Guidelines (Optional)
                    </label>
                    <Textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste a target job description, key role requirements, or specific positioning guidelines (e.g. 'Highlight AWS and Kubernetes leadership')."
                      rows={4}
                      className="text-xs bg-bg"
                    />
                    <p className="text-[11px] text-text-faint mt-1">
                      If provided, AI will optimize phrasing and skill emphasis against this context.
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1.5">
                      Tailoring & Role Alignment Level
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALIGNMENT_OPTIONS.map((opt) => {
                        const selected = bluffLevel === opt.level;
                        return (
                          <button
                            key={opt.level}
                            type="button"
                            onClick={() => setBluffLevel(opt.level)}
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

                  <div>
                    <label className="text-[11px] font-semibold text-text-muted block mb-1">
                      Custom Instructions / Focus
                    </label>
                    <Textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder='e.g. "Focus strongly on distributed systems and kubernetes"'
                      rows={2}
                      className="text-xs bg-bg"
                    />
                  </div>
                </div>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={submittingText || !fullName.trim() || !rawText.trim()}
              className="w-full bg-accent hover:bg-accent-strong text-white font-semibold"
            >
              {submittingText ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating profile from text...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Candidate Profile
                </>
              )}
            </Button>
          </form>
        )}
      </main>
    </>
  );
}