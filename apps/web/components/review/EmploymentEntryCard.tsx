"use client";

import { useState } from "react";
import { Building2, Briefcase, Pencil, Check, X, Calendar, Layers } from "lucide-react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ReviewableBullet } from "./ReviewableBullet";
import { RichText } from "@/components/shared/RichText";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import type { EmploymentEntry } from "@/lib/types";

interface EmploymentEntryCardProps {
  entry: EmploymentEntry;
  index: number;
  isReviewed: (path: string) => boolean;
  onConfirm: (path: string) => void;
  onEditResponsibility: (respIndex: number, text: string) => void;
  onRemoveResponsibility: (respIndex: number) => void;
  onUpdateEntry?: (index: number, updated: Partial<EmploymentEntry>) => void;
}

export function EmploymentEntryCard({
  entry,
  index,
  isReviewed,
  onConfirm,
  onEditResponsibility,
  onRemoveResponsibility,
  onUpdateEntry,
}: EmploymentEntryCardProps) {
  const basePath = `employment.${index}`;
  const [editingMetadata, setEditingMetadata] = useState(false);

  // Draft state for metadata
  const [company, setCompany] = useState(entry.company);
  const [role, setRole] = useState(entry.role);
  const [client, setClient] = useState(entry.client || "");
  const [duration, setDuration] = useState(entry.duration_display);
  const [projectName, setProjectName] = useState(entry.project_name || "");
  const [projectDesc, setProjectDesc] = useState(entry.project_description || "");
  const [techString, setTechString] = useState((entry.technology_used || []).join(", "));

  function handleSaveMetadata() {
    if (!onUpdateEntry) return;
    const techs = techString
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    onUpdateEntry(index, {
      company: company.trim(),
      role: role.trim(),
      client: client.trim() || null,
      duration_display: duration.trim(),
      project_name: projectName.trim() || null,
      project_description: projectDesc.trim() || null,
      technology_used: techs,
    });
    setEditingMetadata(false);
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface overflow-hidden transition-all">
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border bg-bg-elevated/40">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent-strong">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text truncate">{entry.company}</p>
            <p className="text-[13px] text-text-muted flex items-center gap-1 mt-0.5 flex-wrap">
              <Briefcase className="h-3 w-3 shrink-0" />
              <span>{entry.role}</span>
              {entry.client && <span className="text-text-faint">· Client: {entry.client}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={entry.confidence} showValue={false} onlyLow />
            <button
              onClick={() => {
                setCompany(entry.company);
                setRole(entry.role);
                setClient(entry.client || "");
                setDuration(entry.duration_display);
                setProjectName(entry.project_name || "");
                setProjectDesc(entry.project_description || "");
                setTechString((entry.technology_used || []).join(", "));
                setEditingMetadata(!editingMetadata);
              }}
              className="text-xs text-text-faint hover:text-text flex items-center gap-1 p-1 rounded hover:bg-surface-hover transition-colors"
              title="Edit company, role, client, and project details"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{editingMetadata ? "Close" : "Edit Details"}</span>
            </button>
          </div>
          <span className="text-[11px] font-mono text-text-faint flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {entry.duration_display}
          </span>
        </div>
      </div>

      {/* Inline Editor for Experience Metadata */}
      {editingMetadata && (
        <div className="p-4 bg-accent-soft/30 border-b border-border space-y-3 animate-fade-in">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-text-muted mb-1 block">Company</label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-text-muted mb-1 block">Role / Title</label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-text-muted mb-1 block">End Client (Optional)</label>
              <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Barclays, J.P. Morgan" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-text-muted mb-1 block">Duration Display</label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. May/2022 - Present" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-text-muted mb-1 block">Project Name (Optional)</label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-text-muted mb-1 block">Technologies Used (Comma-separated)</label>
              <Input value={techString} onChange={(e) => setTechString(e.target.value)} placeholder="React, Node.js, AWS, TypeScript" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-text-muted mb-1 block">Project Description (Optional)</label>
            <Textarea
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              rows={2}
              placeholder="Brief summary of this project or role context"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setEditingMetadata(false)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSaveMetadata}>
              <Check className="h-3.5 w-3.5" /> Save Experience Details
            </Button>
          </div>
        </div>
      )}

      {/* Details content */}
      <div className="p-4 space-y-3">
        {entry.project_name && (
          <p className="text-[13px]">
            <span className="text-text-faint">Project: </span>
            <span className="text-text font-medium">{entry.project_name}</span>
          </p>
        )}
        {entry.technology_used.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-text-faint flex items-center gap-1 mr-1">
              <Layers className="h-3 w-3" /> Tech:
            </span>
            {entry.technology_used.map((t, i) => (
              <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5">
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

        <div className="pt-2 border-t border-border/50">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
            Key Responsibilities & Achievements
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