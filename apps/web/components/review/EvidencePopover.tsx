import { Quote, Sparkles, AlertTriangle, Wand2 } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import type { SourceType } from "@/lib/types";

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  source: "Copied directly from the original CV",
  verified_transformation: "Reworded by AI, verified against candidate background",
  ai_generated: "Synthesized by AI from career context",
  tailored_enhancement: "AI Enhanced — phrasing tailored for the target role",
  extrapolated_bluff: "AI Aligned — competency added to match target role requirements",
};

export function EvidencePopover({
  evidence,
  sourceType,
}: {
  evidence: string | null;
  sourceType: SourceType;
}) {
  if (sourceType === "extrapolated_bluff") {
    return (
      <Popover
        openOnHover
        trigger={
          <button className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded hover:bg-purple-500/20 transition-colors">
            <Sparkles className="h-3 w-3 text-purple-500" />
            AI Aligned
          </button>
        }
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500 mb-1">
          AI Role Alignment
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          {SOURCE_TYPE_LABEL.extrapolated_bluff}
        </p>
        {evidence && (
          <blockquote className="mt-2 text-[12px] italic text-text-muted border-l-2 border-purple-500/60 pl-2.5 bg-purple-500/5 py-1 rounded-r">
            &ldquo;{evidence}&rdquo;
          </blockquote>
        )}
      </Popover>
    );
  }

  if (sourceType === "tailored_enhancement") {
    return (
      <Popover
        openOnHover
        trigger={
          <button className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 rounded hover:bg-indigo-500/20 transition-colors">
            <Wand2 className="h-3 w-3 text-indigo-500" />
            AI Enhanced
          </button>
        }
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">
          Targeted Phrasing
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          {SOURCE_TYPE_LABEL.tailored_enhancement}
        </p>
        {evidence && (
          <blockquote className="mt-2 text-[12px] italic text-text-muted border-l-2 border-indigo-500/60 pl-2.5 bg-indigo-500/5 py-1 rounded-r">
            &ldquo;{evidence}&rdquo;
          </blockquote>
        )}
      </Popover>
    );
  }

  if (sourceType === "ai_generated") {
    return (
      <Popover
        trigger={
          <button className="inline-flex items-center gap-1 text-[11px] text-confidence-medium hover:underline underline-offset-2 decoration-dotted">
            <Sparkles className="h-3 w-3" />
            AI synthesized
          </button>
        }
      >
        <p className="text-xs text-text-muted leading-relaxed">{SOURCE_TYPE_LABEL.ai_generated}</p>
      </Popover>
    );
  }

  if (!evidence) return null;

  return (
    <Popover
      openOnHover
      trigger={
        <button className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline underline-offset-2 decoration-dotted">
          <Quote className="h-3 w-3" />
          Show source
        </button>
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-faint mb-1.5">
        {SOURCE_TYPE_LABEL[sourceType]}
      </p>
      <blockquote className="text-[13px] italic text-text-muted leading-relaxed border-l-2 border-border pl-3">
        &ldquo;{evidence}&rdquo;
      </blockquote>
    </Popover>
  );
}