"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_MB = 10;
const ACCEPTED = [".pdf", ".docx"];

export function Dropzone({
  file,
  onFileSelected,
  onClear,
  disabled,
}: {
  file: File | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((f: File): string | null => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext)) return "Only PDF or DOCX files are supported.";
    if (f.size > MAX_MB * 1024 * 1024) return `File is larger than the ${MAX_MB}MB limit.`;
    return null;
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      const err = validate(f);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      onFileSelected(f);
    },
    [onFileSelected, validate]
  );

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent-strong">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text truncate">{file.name}</p>
          <p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        {!disabled && (
          <button
            onClick={onClear}
            className="text-text-faint hover:text-danger p-1.5 rounded hover:bg-surface-hover"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed p-12 text-center cursor-pointer transition-colors",
          dragging ? "border-accent bg-accent-soft/40" : "border-border hover:border-border-strong hover:bg-surface-hover/50"
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <UploadCloud className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-text">
            Drop a CV here, or <span className="text-accent">browse</span>
          </p>
          <p className="text-xs text-text-muted mt-1">PDF or DOCX, up to {MAX_MB}MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}