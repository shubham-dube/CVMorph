import { useState } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  const [imageError, setImageError] = useState(false);

  if (src && !imageError) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setImageError(true)}
        className={cn(
          "h-8 w-8 shrink-0 rounded-full object-cover border border-border",
          className
        )}
        referrerPolicy="no-referrer"
      />
    );
  }

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