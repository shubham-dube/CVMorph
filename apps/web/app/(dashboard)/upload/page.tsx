"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/layout/Topbar";
import { Dropzone } from "@/components/upload/Dropzone";
import { StageStepper, type Stage } from "@/components/upload/StageStepper";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { documentsApi, pollJob, ApiError } from "@/lib/api-client";
import type { JobStatus } from "@/lib/types";

const STAGES: Stage[] = [
  { key: "uploading", label: "Uploading" },
  { key: "parsing", label: "Parsing text" },
  { key: "extracting", label: "AI extracting" },
  { key: "ready", label: "Ready for review" },
];

function stageIndexFor(status: JobStatus): number {
  // Stage 0: upload queued
  if (status === "queued") return 0;
  // Stage 1: actively parsing text from the file
  if (status === "parsing" || status === "processing" || status === "retrying") return 1;
  // Stage 2: AI extraction running (parse done, profile not yet created)
  if (status === "extracting" || status === "parsed") return 2;
  // Stage 3: extraction complete — profile is ready
  if (status === "ready_for_review" || status === "complete" || status === "success") return 3;
  return 0;
}

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function handleSubmit() {
    if (!file) return;
    setSubmitting(true);
    setFailed(null);
    setStageIndex(0);
    try {
      const upload = await documentsApi.upload(file, {
        extractionInstructions: instructions.trim() || undefined,
      });
      await pollJob(upload.job_id, (status) => setStageIndex(stageIndexFor(status)));
      setStageIndex(STAGES.length - 1);
      // Always use candidate_id from the upload response — that's the stable ID
      // The job's entity_id after completion is the profile_id, not the candidate_id
      toast.success("CV extracted — ready for your review.");
      router.push(`/candidates/${upload.candidate_id}/review`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Upload failed. Please try again.";
      setFailed(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Upload CV" />
      <main className="flex-1 p-6 max-w-2xl w-full mx-auto">
        {stageIndex === null ? (
          <>
            <p className="text-sm text-text-muted mb-5">
              Drop in a candidate&apos;s CV — any layout, PDF or DOCX. We&apos;ll extract the details and
              hand it to you for a quick review before anything gets formatted.
            </p>

            <Dropzone file={file} onFileSelected={setFile} onClear={() => setFile(null)} />

            <div className="mt-4">
              <button
                onClick={() => setShowInstructions((s) => !s)}
                className="flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text"
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

            <Button className="w-full mt-6" size="lg" disabled={!file} onClick={handleSubmit}>
              Extract candidate profile
            </Button>
          </>
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
        )}
      </main>
    </>
  );
}