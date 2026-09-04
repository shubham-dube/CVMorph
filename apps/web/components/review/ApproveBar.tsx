"use client";

import { CheckCircle2, ChevronRight, AlertTriangle, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";

interface ApproveBarProps {
  totalFlagged: number;
  reviewedCount: number;
  onApprove: () => void;
  onJumpToNext: () => void;
  approving: boolean;
  candidateName: string;
  alreadyApproved?: boolean;
  isDirty?: boolean;
  onSaveEdits?: () => void;
}

export function ApproveBar({
  totalFlagged,
  reviewedCount,
  onApprove,
  onJumpToNext,
  approving,
  candidateName,
  alreadyApproved = false,
  isDirty = false,
  onSaveEdits,
}: ApproveBarProps) {
  const allDone = reviewedCount >= totalFlagged;
  const pct = totalFlagged === 0 ? 100 : Math.min(100, (reviewedCount / totalFlagged) * 100);

  // If already approved and no edits were made, show clean status
  if (alreadyApproved && !isDirty) {
    return (
      <div className="sticky top-0 z-30 mb-6 border-b border-border bg-bg/95 backdrop-blur-md px-4 py-2.5 rounded-[var(--radius-md)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-confidence-high-soft text-confidence-high">
              <Check className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-text">Approved & Verified</p>
              <p className="text-[11px] text-text-muted">Changes here will reflect directly in the live preview.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-confidence-high font-medium">Ready for generation</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 mb-6 border-b border-border bg-bg/95 backdrop-blur-md px-4 py-2.5 rounded-[var(--radius-md)] shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1 text-xs">
            <span className="font-semibold text-text truncate max-w-xs">{candidateName}</span>
            <span className="text-text-muted font-mono text-[11px]">
              {totalFlagged === 0
                ? "All items high confidence"
                : `${reviewedCount} of ${totalFlagged} items verified`}
            </span>
          </div>
          <Progress value={pct} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!allDone && totalFlagged > 0 && (
            <Button variant="ghost" size="sm" onClick={onJumpToNext} className="text-xs">
              Next item <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          )}

          <Button
            onClick={onApprove}
            loading={approving}
            size="sm"
            variant={allDone ? "default" : "secondary"}
            className="text-xs font-medium"
          >
            {allDone ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {alreadyApproved && isDirty ? "Save & Re-approve" : "Approve Profile"}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-confidence-medium mr-1" />
                Approve with warnings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}