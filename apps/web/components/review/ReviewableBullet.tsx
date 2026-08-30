"use client";

import { useRef, useState } from "react";
import { Check, Pencil, Trash2, Bold, X } from "lucide-react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidencePopover } from "./EvidencePopover";
import { RichText } from "@/components/shared/RichText";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { needsReview, type SourceType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ReviewableBulletProps {
  text: string;
  confidence: number;
  sourceType: SourceType;
  evidence: string | null;
  reviewed: boolean;
  onConfirm: () => void;
  onEdit: (newText: string) => void;
  onRemove: () => void;
  forceExpanded?: boolean;
  /** Used to scroll-highlight the next unreviewed field from the sticky approve bar. */
  fieldPath: string;
}

export function ReviewableBullet({
  text,
  confidence,
  sourceType,
  evidence,
  reviewed,
  onConfirm,
  onEdit,
  onRemove,
  forceExpanded,
  fieldPath,
}: ReviewableBulletProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const flagged = needsReview(confidence) && !reviewed;
  const showAffordances = forceExpanded || needsReview(confidence);

  function applyBold() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    if (selectionStart === selectionEnd) return;
    const selected = value.slice(selectionStart, selectionEnd);
    const next = value.slice(0, selectionStart) + `**${selected}**` + value.slice(selectionEnd);
    setDraft(next);
  }

  if (editing) {
    return (
      <div
        id={fieldPath}
        className="group relative rounded-[var(--radius-sm)] border border-accent bg-accent-soft/40 p-3 animate-fade-in"
      >
        <Textarea
          ref={textareaRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="bg-surface"
        />
        <div className="mt-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={applyBold}
            title="Select text first, then click to wrap it in **bold**"
          >
            <Bold className="h-3.5 w-3.5" /> Bold selection
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onEdit(draft);
                setEditing(false);
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={fieldPath}
      className={cn(
        "group relative rounded-[var(--radius-sm)] border pl-3 pr-2 py-2 -mx-3 transition-colors",
        flagged
          ? "border-l-[3px] border-l-confidence-low border-y-transparent border-r-transparent bg-confidence-low-soft/30"
          : reviewed && needsReview(confidence)
          ? "border-l-[3px] border-l-confidence-high border-y-transparent border-r-transparent"
          : "border-transparent hover:bg-surface-hover"
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-text-faint" />
        <p className="text-sm text-text leading-relaxed flex-1">
          <RichText text={text} />
        </p>
      </div>
      <div
        className={cn(
          "flex items-center gap-3 mt-1.5 pl-3.5 text-xs transition-opacity",
          showAffordances ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <ConfidenceBadge confidence={confidence} />
        <EvidencePopover evidence={evidence} sourceType={sourceType} />
        <span className="flex-1" />
        {reviewed && needsReview(confidence) && (
          <span className="text-[11px] text-confidence-high flex items-center gap-1">
            <Check className="h-3 w-3" /> Reviewed
          </span>
        )}
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-text-muted hover:text-text"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
        {needsReview(confidence) && !reviewed && (
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1 text-confidence-high hover:underline"
          >
            <Check className="h-3 w-3" /> Confirm
          </button>
        )}
        <button
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-danger/80 hover:text-danger"
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      </div>
    </div>
  );
}