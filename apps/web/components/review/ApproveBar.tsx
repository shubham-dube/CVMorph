"use client";

import { CheckCircle2, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Tooltip } from "@/components/ui/Tooltip";

interface ApproveBarProps {
  totalFlagged: number;
  reviewedCount: number;
  onApprove: () => void;
  onJumpToNext: () => void;
  approving: boolean;
  candidateName: string;
}

export function ApproveBar({
  totalFlagged,
  reviewedCount,
  onApprove,
  onJumpToNext,
  approving,
  candidateName,
}: ApproveBarProps) {
  const allDone = reviewedCount >= totalFlagged;
  const pct = totalFlagged === 0 ? 100 : (reviewedCount / totalFlagged) * 100;

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-6 border-b border-border bg-bg/90 backdrop-blur-md px-6 py-3">
      <div className="mx-auto flex max-w-4xl items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[13px] font-medium text-text truncate">{candidateName}</p>
            <p className="text-[12px] text-text-muted font-mono shrink-0">
              {totalFlagged === 0 ? "Nothing to review" : `${reviewedCount} of ${totalFlagged} reviewed`}
            </p>
          </div>
          <Progress value={pct} />
        </div>

        {!allDone && (
          <Button variant="ghost" size="sm" onClick={onJumpToNext}>
            Next unreviewed <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}

        {allDone ? (
          <Button onClick={onApprove} loading={approving} size="md">
            <CheckCircle2 className="h-4 w-4" /> Approve & continue
          </Button>
        ) : (
          <Tooltip content={`Confirm, edit, or remove ${totalFlagged - reviewedCount} more field(s) first`}>
            <Button disabled size="md">
              <Info className="h-4 w-4" /> Approve & continue
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}