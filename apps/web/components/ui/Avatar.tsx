import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong text-[11px] font-semibold",
        className
      )}
    >
      {initials(name)}
    </div>
  );
}