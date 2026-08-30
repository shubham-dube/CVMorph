import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Stage {
  key: string;
  label: string;
}

export function StageStepper({
  stages,
  currentIndex,
  failed,
}: {
  stages: Stage[];
  currentIndex: number;
  failed?: boolean;
}) {
  return (
    <div className="flex items-center">
      {stages.map((stage, i) => {
        const done = i < currentIndex || (failed === false && i === currentIndex && currentIndex === stages.length - 1);
        const active = i === currentIndex && !failed;
        const isFailedStep = failed && i === currentIndex;

        return (
          <div key={stage.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors shrink-0",
                  isFailedStep
                    ? "border-danger bg-danger-soft text-danger"
                    : done
                    ? "border-confidence-high bg-confidence-high-soft text-confidence-high"
                    : active
                    ? "border-accent bg-accent-soft text-accent-strong"
                    : "border-border text-text-faint"
                )}
              >
                {isFailedStep ? "!" : done ? <Check className="h-4 w-4" /> : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium text-center whitespace-nowrap",
                  active || done ? "text-text" : "text-text-faint"
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-2 mb-5 rounded-full transition-colors",
                  i < currentIndex ? "bg-confidence-high" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}