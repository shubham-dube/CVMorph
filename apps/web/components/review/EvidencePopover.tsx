import { Quote, Sparkles } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import type { SourceType } from "@/lib/types";

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  source: "Copied directly from the original CV",
  verified_transformation: "Reworded by AI, every fact checked against the source",
  ai_generated: "Synthesized by AI — no single matching source sentence",
};

export function EvidencePopover({ evidence, sourceType }: { evidence: string | null; sourceType: SourceType }) {
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