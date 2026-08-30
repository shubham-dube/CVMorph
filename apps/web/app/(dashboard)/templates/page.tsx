"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutTemplate,
  Plus,
  Trash2,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input, Textarea } from "@/components/ui/Input";
import { templatesApi, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/utils";

export default function TemplatesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templatesApi.list(),
  });

  const active = templates?.filter((t) => t.is_active) ?? [];
  const inactive = templates?.filter((t) => !t.is_active) ?? [];

  return (
    <>
      <Topbar title="Templates" />
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-text-muted">
            {templates
              ? `${active.length} active template${active.length === 1 ? "" : "s"}`
              : ""}
          </p>
          {isAdmin && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Upload template
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-[var(--radius-lg)]" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title="Couldn't load templates"
            description="Check the API connection and try again."
          />
        )}

        {templates && templates.length === 0 && (
          <EmptyState
            icon={<LayoutTemplate className="h-8 w-8" />}
            title="No templates yet"
            description={
              isAdmin
                ? "Upload a .docx or .tex.j2 template file to get started."
                : "Ask your admin to upload a template."
            }
            action={
              isAdmin ? (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Upload template
                </Button>
              ) : undefined
            }
          />
        )}

        {/* Active templates grid */}
        {active.length > 0 && (
          <section className="mb-8">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-4">
              Active templates
            </h3>
            <TemplateGrid
              templates={active}
              isAdmin={isAdmin}
              onDelete={(id) => setDeleteId(id)}
            />
          </section>
        )}

        {/* Inactive templates */}
        {isAdmin && inactive.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-4">
              Inactive templates
            </h3>
            <TemplateGrid
              templates={inactive}
              isAdmin={isAdmin}
              onDelete={(id) => setDeleteId(id)}
              dimmed
            />
          </section>
        )}
      </main>

      {/* Upload dialog */}
      <UploadTemplateDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["templates"] });
          setUploadOpen(false);
        }}
      />

      {/* Delete confirm dialog */}
      <DeleteTemplateDialog
        templateId={deleteId}
        onClose={() => setDeleteId(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["templates"] });
          setDeleteId(null);
        }}
      />
    </>
  );
}

// ── Template grid ─────────────────────────────────────────────────────────────

function TemplateGrid({
  templates,
  isAdmin,
  onDelete,
  dimmed = false,
}: {
  templates: Awaited<ReturnType<typeof templatesApi.list>>;
  isAdmin: boolean;
  onDelete: (id: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${dimmed ? "opacity-50" : ""}`}>
      {templates.map((t) => {
        const sections: string[] = t.config_json?.sections ?? [];
        return (
          <div
            key={t.id}
            className="relative rounded-[var(--radius-lg)] border border-border bg-surface p-5 flex flex-col gap-3 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-accent-soft border border-accent/20">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              {isAdmin && (
                <button
                  onClick={() => onDelete(t.id)}
                  className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-text-faint hover:text-danger hover:bg-danger-soft transition-all"
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[14px] font-semibold text-text">{t.name}</p>
                <span className="rounded-[var(--radius-sm)] border border-border bg-surface-raised px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
                  {t.template_type}
                </span>
              </div>
              {t.description && (
                <p className="text-xs text-text-muted line-clamp-2">{t.description}</p>
              )}
            </div>
            {sections.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {sections.slice(0, 4).map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-text-faint"
                  >
                    {s}
                  </span>
                ))}
                {sections.length > 4 && (
                  <span className="text-[10px] text-text-faint self-center">
                    +{sections.length - 4} more
                  </span>
                )}
              </div>
            )}
            <p className="text-[11px] text-text-faint border-t border-border pt-3 mt-auto">
              Added {formatDateTime(t.created_at)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Upload dialog ─────────────────────────────────────────────────────────────

function UploadTemplateDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => templatesApi.create(file, name, description || undefined),
    onSuccess: () => {
      toast.success("Template uploaded successfully.");
      setFile(null);
      setName("");
      setDescription("");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Upload failed.");
    },
  });

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {/* File drop */}
          <div
            onClick={() => fileRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed p-8 cursor-pointer transition-colors ${
              file
                ? "border-accent bg-accent-soft"
                : "border-border hover:border-border-strong hover:bg-surface-hover"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.tex.j2,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
            {file ? (
              <>
                <FileText className="h-6 w-6 text-accent" />
                <p className="text-sm font-medium text-text">{file.name}</p>
                <button
                  className="text-xs text-text-faint hover:text-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-3.5 w-3.5 inline" /> Remove
                </button>
              </>
            ) : (
              <>
                <UploadCloud className="h-6 w-6 text-text-faint" />
                <p className="text-sm text-text-muted">Click to select a .docx or .tex.j2 template</p>
              </>
            )}
          </div>

          <div>
            <label className="text-[13px] font-medium text-text-muted mb-1.5 block">
              Template name <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="e.g. Copious Standard CV"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[13px] font-medium text-text-muted mb-1.5 block">
              Description <span className="text-text-faint font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="Brief description of the template's style or intended use"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!file || !name.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete dialog ─────────────────────────────────────────────────────────────

function DeleteTemplateDialog({
  templateId,
  onClose,
  onSuccess,
}: {
  templateId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mutation = useMutation({
    mutationFn: () => templatesApi.remove(templateId!),
    onSuccess: () => {
      toast.success("Template deleted.");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    },
  });

  return (
    <Dialog open={!!templateId} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete template?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-muted mt-3">
          This will permanently delete the template. Any in-progress generations using it may fail.
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
