"use client";

import { Building2, Briefcase } from "lucide-react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ReviewableBullet } from "./ReviewableBullet";
import { RichText } from "@/components/shared/RichText";
import { Badge } from "@/components/ui/Badge";
import type { EmploymentEntry } from "@/lib/types";

interface EmploymentEntryCardProps {
  entry: EmploymentEntry;
  index: number;
  isReviewed: (path: string) => boolean;
  onConfirm: (path: string) => void;
  onEditResponsibility: (respIndex: number, text: string) => void;
  onRemoveResponsibility: (respIndex: number) => void;
}

export function EmploymentEntryCard({
  entry,
  index,
  isReviewed,
  onConfirm,
  onEditResponsibility,
  onRemoveResponsibility,
}: EmploymentEntryCardProps) {
  const basePath = `employment.${index}`;

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border bg-bg-elevated/40">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent-strong">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text">{entry.company}</p>
            <p className="text-[13px] text-text-muted flex items-center gap-1 mt-0.5">
              <Briefcase className="h-3 w-3" /> {entry.role}
              {entry.client && <span className="text-text-faint">· Client: {entry.client}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <ConfidenceBadge confidence={entry.confidence} showValue={false} />
          <span className="text-[11px] font-mono text-text-faint">{entry.duration_display}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {entry.project_name && (
          <p className="text-[13px]">
            <span className="text-text-faint">Project: </span>
            <span className="text-text font-medium">{entry.project_name}</span>
          </p>
        )}
        {entry.technology_used.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.technology_used.map((t, i) => (
              <Badge key={i} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {entry.project_description && (
          <p className="text-[13px] text-text-muted leading-relaxed">
            <RichText text={entry.project_description} />
          </p>
        )}

        <div className="pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-1.5">
            Responsibilities
          </p>
          <div className="space-y-1">
            {entry.responsibilities.map((r, i) => {
              const path = `${basePath}.responsibilities.${i}.text`;
              return (
                <ReviewableBullet
                  key={i}
                  fieldPath={path}
                  text={r.text}
                  confidence={r.confidence}
                  sourceType={r.source_type}
                  evidence={r.evidence}
                  reviewed={isReviewed(path)}
                  onConfirm={() => onConfirm(path)}
                  onEdit={(newText) => onEditResponsibility(i, newText)}
                  onRemove={() => onRemoveResponsibility(i)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}