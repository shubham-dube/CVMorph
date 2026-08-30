"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X, Plus } from "lucide-react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { needsReview } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SkillGroupCardProps {
  category: string;
  skills: string[];
  confidence: number;
  reviewed: boolean;
  onConfirm: () => void;
  onEdit: (category: string, skills: string[]) => void;
  onRemove: () => void;
  fieldPath: string;
}

export function SkillGroupCard({
  category,
  skills,
  confidence,
  reviewed,
  onConfirm,
  onEdit,
  onRemove,
  fieldPath,
}: SkillGroupCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftCategory, setDraftCategory] = useState(category);
  const [draftSkills, setDraftSkills] = useState(skills);
  const [newSkill, setNewSkill] = useState("");
  const flagged = needsReview(confidence) && !reviewed;

  if (editing) {
    return (
      <div id={fieldPath} className="rounded-[var(--radius-md)] border border-accent bg-accent-soft/40 p-3">
        <Input
          value={draftCategory}
          onChange={(e) => setDraftCategory(e.target.value)}
          className="mb-2 font-medium"
          placeholder="Category name"
        />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {draftSkills.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2 py-0.5 text-xs text-text"
            >
              {s}
              <button
                onClick={() => setDraftSkills(draftSkills.filter((_, idx) => idx !== i))}
                className="text-text-faint hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <Input
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            placeholder="Add a skill..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSkill.trim()) {
                setDraftSkills([...draftSkills, newSkill.trim()]);
                setNewSkill("");
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (newSkill.trim()) {
                setDraftSkills([...draftSkills, newSkill.trim()]);
                setNewSkill("");
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onEdit(draftCategory, draftSkills);
              setEditing(false);
            }}
          >
            <Check className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      id={fieldPath}
      className={cn(
        "group rounded-[var(--radius-md)] border p-3 transition-colors",
        flagged ? "border-confidence-low/50 bg-confidence-low-soft/20" : "border-border hover:border-border-strong"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[13px] font-semibold text-text">{category}</h4>
        <ConfidenceBadge confidence={confidence} showValue={false} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s, i) => (
          <span key={i} className="rounded-full bg-surface-hover px-2 py-0.5 text-[12px] text-text-muted">
            {s}
          </span>
        ))}
      </div>
      <div
        className={cn(
          "flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border/60 text-xs transition-opacity",
          needsReview(confidence) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        {reviewed && needsReview(confidence) && (
          <span className="text-[11px] text-confidence-high flex items-center gap-1">
            <Check className="h-3 w-3" /> Reviewed
          </span>
        )}
        <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-text-muted hover:text-text">
          <Pencil className="h-3 w-3" /> Edit
        </button>
        {needsReview(confidence) && !reviewed && (
          <button onClick={onConfirm} className="inline-flex items-center gap-1 text-confidence-high hover:underline">
            <Check className="h-3 w-3" /> Confirm
          </button>
        )}
        <button onClick={onRemove} className="inline-flex items-center gap-1 text-danger/80 hover:text-danger ml-auto">
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      </div>
    </div>
  );
}