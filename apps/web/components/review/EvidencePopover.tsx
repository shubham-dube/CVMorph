/**
 * EvidencePopover — Epic 4.3
 *
 * A "Show source" popover that displays the verbatim evidence text from the
 * original CV that a field was derived from. The single highest-leverage trust
 * feature from PRD §4 — click any field, see where it came from.
 *
 * Usage:
 *   <EvidencePopover evidence={bullet.evidence} sourceType={bullet.source_type} />
 *
 * Behaviour:
 *   - evidence !== null → shows the source span text
 *   - source_type === "ai_generated" → shows a distinct "AI synthesised" warning
 *   - evidence === null + source_type !== "ai_generated" → should not happen (validator catches it)
 *
 * TODO (Epic 4.3): implement with a headless Radix UI popover primitive
 */

import type { SourceType } from "@cv-platform/shared-types";

interface EvidencePopoverProps {
  evidence: string | null;
  sourceType: SourceType;
}

export function EvidencePopover({ evidence, sourceType }: EvidencePopoverProps) {
  if (sourceType === "ai_generated") {
    return (
      <button
        className="text-xs text-amber-400 underline decoration-dotted"
        title="This content was synthesised by AI — no single source sentence"
      >
        ⚠ AI generated
      </button>
    );
  }

  if (!evidence) return null;

  return (
    // TODO (Epic 4.3): replace with Radix Popover
    <details className="inline">
      <summary className="text-xs text-blue-400 cursor-pointer list-none underline decoration-dotted">
        Show source
      </summary>
      <div className="absolute z-10 p-3 bg-gray-800 border border-gray-600 rounded shadow-xl text-xs text-gray-200 max-w-sm">
        <span className="font-semibold text-gray-400 uppercase tracking-wide">Source text</span>
        <blockquote className="mt-1 italic">&ldquo;{evidence}&rdquo;</blockquote>
      </div>
    </details>
  );
}
