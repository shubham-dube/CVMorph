import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import { getConfidenceLevel, type ConfidenceLevel } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";

const CONFIG: Record<ConfidenceLevel, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  high: { label: "High", icon: CheckCircle2, color: "text-confidence-high", bg: "bg-confidence-high-soft" },
  medium: { label: "Medium", icon: AlertTriangle, color: "text-confidence-medium", bg: "bg-confidence-medium-soft" },
  low: { label: "Low", icon: AlertOctagon, color: "text-confidence-low", bg: "bg-confidence-low-soft" },
};

export function ConfidenceBadge({
  confidence,
  showValue = true,
  className,
}: {
  confidence: number;
  showValue?: boolean;
  className?: string;
}) {
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
      <Icon className="h-3 w-3" />
      {label}
      {showValue && <span className="font-mono opacity-80">{formatPercent(confidence)}</span>}
    </span>
  );
}