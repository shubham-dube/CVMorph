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
  Lock,
  Pencil,
  Eye,
  Download,
  CheckCircle2,
  Info,
  Sparkles,
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
import type { TemplateResponse } from "@/lib/types";

export default function TemplatesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<TemplateResponse | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateResponse | null>(null);

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templatesApi.list(),
  });

  const systemTemplates = templates?.filter((t) => t.is_system) ?? [];
  const customTemplates = templates?.filter((t) => !t.is_system && t.is_active) ?? [];

  return (
    <>
      <Topbar title="Template Library" />
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-8">
        {/* Header summary & action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text">Templates</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Manage system templates and custom company layouts for DOCX and XeLaTeX output.
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setUploadOpen(true)} className="self-start sm:self-auto">
              <Plus className="h-3.5 w-3.5" /> Upload Template
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

        {/* System Templates Section */}
        {systemTemplates.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="h-3 w-3" />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-faint">
                System Templates (Built-in Library)
              </h3>
            </div>
            <p className="text-xs text-text-muted">
              Pre-configured, battle-tested templates guaranteed to render pixel-perfect DOCX and PDF documents.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {systemTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isAdmin={isAdmin}
                  onPreview={() => setPreviewTemplate(t)}
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              ))}
            </div>
          </section>
        )}

        {/* Custom Organization Templates */}
        <section className="space-y-3 pt-4 border-t border-border/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-faint">
                Custom Organization Templates
              </h3>
              <span className="text-[11px] font-mono text-text-muted">({customTemplates.length})</span>
            </div>
          </div>

          {customTemplates.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center space-y-3 bg-surface/40">
              <LayoutTemplate className="h-8 w-8 text-text-faint mx-auto" />
              <div>
                <p className="text-sm font-semibold text-text">No custom templates yet</p>
                <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                  Upload your agency or company .docx template with docxtpl placeholders to start formatting into your own branding.
                </p>
              </div>
              {isAdmin && (
                <Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Upload custom template
                </Button>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {customTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isAdmin={isAdmin}
                  onPreview={() => setPreviewTemplate(t)}
                  onEdit={() => setEditTemplate(t)}
                  onDelete={() => setDeleteId(t.id)}
                />
              ))}
            </div>
          )}
        </section>
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

      {/* Edit Template dialog */}
      <EditTemplateDialog
        template={editTemplate}
        onClose={() => setEditTemplate(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["templates"] });
          setEditTemplate(null);
        }}
      />

      {/* Preview modal */}
      <PreviewTemplateModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
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

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isAdmin,
  onPreview,
  onEdit,
  onDelete,
}: {
  template: TemplateResponse;
  isAdmin: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sections: string[] = template.config_json?.sections ?? [];

  return (
    <div className="relative rounded-[var(--radius-lg)] border border-border bg-surface p-5 flex flex-col gap-3 group hover:border-border-strong hover:shadow-sm transition-all">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-accent-soft border border-accent/20">
          <FileText className="h-5 w-5 text-accent" />
        </div>

        <div className="flex items-center gap-1">
          {template.is_system ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised border border-border px-2 py-0.5 text-[10px] font-semibold text-accent">
              <Lock className="h-2.5 w-2.5" /> System Library
            </span>
          ) : (
            isAdmin && (
              <>
                <button
                  onClick={onEdit}
                  className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-text-faint hover:text-text hover:bg-surface-hover transition-all"
                  title="Edit template name & description"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-text-faint hover:text-danger hover:bg-danger-soft transition-all"
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[14px] font-semibold text-text">{template.name}</p>
          <span className="rounded-[var(--radius-sm)] border border-border bg-surface-raised px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
            {template.template_type}
          </span>
        </div>
        <p className="text-xs text-text-muted line-clamp-2 min-h-[32px]">
          {template.description || "No description provided."}
        </p>
      </div>

      <div className="pt-2 border-t border-border flex items-center justify-between mt-auto">
        <button
          onClick={onPreview}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5" /> Inspect / Specs
        </button>
        <span className="text-[11px] text-text-faint font-mono">
          {formatDateTime(template.created_at).split(",")[0]}
        </span>
      </div>
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
    mutationFn: () => templatesApi.create(file, name.trim(), description.trim() || undefined),
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload custom template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div
            onClick={() => fileRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed p-7 cursor-pointer transition-colors ${
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
                if (f) {
                  setFile(f);
                  if (!name) {
                    // Auto-fill friendly name from file name
                    const autoName = f.name.replace(/\.(docx|tex\.j2|tex)$/i, "").replace(/[-_]/g, " ");
                    setName(autoName);
                  }
                }
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
                <p className="text-[11px] text-text-faint">Supports standard docxtpl placeholders</p>
              </>
            )}
          </div>

          <div>
            <label className="text-[12px] font-medium text-text-muted mb-1 block">
              Template Name <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="e.g. Modern Agency Executive"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-text-muted mb-1 block">
              Description <span className="text-text-faint font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="Brief description of typography, styling, or intended use case"
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
              Upload Template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Template dialog ──────────────────────────────────────────────────────

function EditTemplateDialog({
  template,
  onClose,
  onSuccess,
}: {
  template: TemplateResponse | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Sync state when template opens
  const open = Boolean(template);
  useState(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
    }
  });

  const mutation = useMutation({
    mutationFn: () =>
      templatesApi.update(template!.id, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Template metadata updated.");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
    },
  });

  if (!template) return null;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-[12px] font-medium text-text-muted mb-1 block">
              Template Name
            </label>
            <Input
              value={name || template.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-text-muted mb-1 block">
              Description
            </label>
            <Textarea
              value={description !== "" ? description : template.description || ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Preview / Spec Modal ──────────────────────────────────────────────────────

function PreviewTemplateModal({
  template,
  onClose,
}: {
  template: TemplateResponse | null;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  if (!template) return null;

  async function handleDownloadOriginal() {
    setDownloading(true);
    try {
      const res = await templatesApi.getDownloadUrl(template!.id);
      if (res.download_url) {
        window.open(res.download_url, "_blank");
      }
    } catch {
      toast.error("Couldn't retrieve download link for this template.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={Boolean(template)} onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            <span>{template.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-3 text-xs text-text-muted">
          <div className="p-4 rounded-[var(--radius-md)] bg-bg-elevated border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-text-faint font-medium">Format:</span>
              <span className="font-mono text-text font-semibold uppercase">{template.template_type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-faint font-medium">Template Type:</span>
              <span className="text-text font-semibold">
                {template.is_system ? "System Library (Built-in)" : "Organization Custom"}
              </span>
            </div>
            {template.description && (
              <div className="pt-2 border-t border-border">
                <span className="text-text-faint block mb-0.5">Description:</span>
                <p className="text-text leading-relaxed">{template.description}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOriginal}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Download & View Document
            </Button>
            <Button size="sm" onClick={onClose}>
              Close
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
          This will permanently delete this custom template. System templates cannot be deleted.
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
