/**
 * ConfidenceBadge — Epic 4.3
 *
 * Shows a colour-coded badge (high / medium / low) for a confidence score.
 * The core trust feature from PRD §9.3 — built early, used on every field.
 *
 * Usage:
 *   <ConfidenceBadge confidence={0.92} />
 *   <ConfidenceBadge confidence={0.72} />  ← shows as medium/amber
 *   <ConfidenceBadge confidence={0.45} />  ← shows as low/red, triggers review
 *
 * TODO (Epic 4.3): implement with Tailwind classes + animation
 */

import type { ConfidenceLevel } from "@cv-platform/shared-types";
import { getConfidenceLevel } from "@cv-platform/shared-types";

interface ConfidenceBadgeProps {
  confidence: number;
  showValue?: boolean;
}

export function ConfidenceBadge({ confidence, showValue = false }: ConfidenceBadgeProps) {
  const level: ConfidenceLevel = getConfidenceLevel(confidence);

  // TODO (Epic 4.3): replace with polished Tailwind design
  const colors: Record<ConfidenceLevel, string> = {
    high: "bg-green-500",
    medium: "bg-amber-400",
    low: "bg-red-500",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${colors[level]}`}
      title={`Confidence: ${(confidence * 100).toFixed(0)}%`}
    >
      {level.toUpperCase()}
      {showValue && ` · ${(confidence * 100).toFixed(0)}%`}
    </span>
  );
}
