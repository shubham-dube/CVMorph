import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import { getConfidenceLevel, type ConfidenceLevel } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";

const CONFIG: Record<ConfidenceLevel, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  high: { label: "High", icon: CheckCircle2, color: "text-confidence-high", bg: "bg-confidence-high-soft" },
  medium: { label: "Needs Review", icon: AlertTriangle, color: "text-confidence-medium", bg: "bg-confidence-medium-soft border border-confidence-medium/30" },
  low: { label: "Low Confidence", icon: AlertOctagon, color: "text-confidence-low", bg: "bg-confidence-low-soft border border-confidence-low/30" },
};

export function ConfidenceBadge({
  confidence,
  showValue = true,
  onlyLow = false,
  className,
}: {
  confidence: number;
  showValue?: boolean;
  onlyLow?: boolean;
  className?: string;
}) {
  // If high confidence and onlyLow is requested, suppress to avoid visual clutter
  if (onlyLow && confidence >= 0.85) {
    return null;
  }

  const level = getConfidenceLevel(confidence);
  const { label, icon: Icon, color, bg } = CONFIG[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        bg,
        color,
        className
      )}
      title={`Extraction confidence: ${formatPercent(confidence)}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{label}</span>
      {showValue && <span className="font-mono opacity-80">{formatPercent(confidence)}</span>}
    </span>
  );
}