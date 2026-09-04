"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Maximize2,
  Minimize2,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { templatesApi, generationsApi, pollGeneration, ApiError } from "@/lib/api-client";
import type { TemplateResponse, GenerationResponse } from "@/lib/types";

interface PreviewPanelProps {
  candidateId: string;
  candidateName: string;
  onClose?: () => void;
}

export function PreviewPanel({ candidateId, candidateName, onClose }: PreviewPanelProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [rendering, setRendering] = useState(false);
  const [renderStep, setRenderStep] = useState<string>("");
  const [generation, setGeneration] = useState<GenerationResponse | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [fullscreen, setFullscreen] = useState(false);

  // Keyboard shortcut: Escape exits fullscreen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen]);

  // Fetch available templates
  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templatesApi.list(),
  });

  // Set default template
  useEffect(() => {
    if (templates && templates.length > 0 && !selectedTemplateId) {
      const defaultTpl = templates.find((t) => t.is_system) || templates[0];
      setSelectedTemplateId(defaultTpl.id);
    }
  }, [templates, selectedTemplateId]);

  // Fetch most recent generation for this candidate if one exists
  const { data: recentGens } = useQuery({
    queryKey: ["generations", candidateId],
    queryFn: () => generationsApi.list({ candidateId, pageSize: 1 }),
    enabled: !!candidateId,
  });

  useEffect(() => {
    if (recentGens?.items && recentGens.items.length > 0 && !generation) {
      const latest = recentGens.items[0];
      if (latest.status === "complete") {
        setGeneration(latest);
      }
    }
  }, [recentGens, generation]);

  async function handleRenderPreview() {
    if (!selectedTemplateId) {
      toast.error("Please select a template to preview.");
      return;
    }

    setRendering(true);
    setRenderStep("Submitting render task...");
    try {
      const initial = await generationsApi.create(candidateId, selectedTemplateId);
      setRenderStep("Formatting with template engine...");

      const completed = await pollGeneration(initial.id, (status) => {
        if (status === "rendering") {
          setRenderStep("Compiling PDF with LibreOffice...");
        }
      });

      setGeneration(completed);
      toast.success("CV preview compiled successfully!");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Preview rendering failed.";
      toast.error(msg);
    } finally {
      setRendering(false);
      setRenderStep("");
    }
  }

  const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);

  return (
    <div
      className={`flex flex-col transition-all duration-150 ${
        fullscreen
          ? "fixed inset-0 z-[100] w-screen h-screen bg-bg p-0 m-0 border-none rounded-none shadow-2xl"
          : "rounded-[var(--radius-lg)] border border-border bg-surface h-[calc(100vh-140px)] sticky top-24"
      }`}
    >
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-bg-elevated/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-accent-soft text-accent">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-text truncate">Live CV Studio Preview</h4>
            <p className="text-[10px] text-text-faint truncate">
              {selectedTemplate ? `${selectedTemplate.name} (${selectedTemplate.template_type.toUpperCase()})` : "Select template"}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={rendering || loadingTemplates}
            className="text-xs rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:border-accent max-w-[180px] truncate"
          >
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_system ? "★" : ""}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            onClick={handleRenderPreview}
            disabled={rendering || !selectedTemplateId}
            className="text-xs font-semibold h-8"
          >
            {rendering ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                Rendering...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Render Preview
              </>
            )}
          </Button>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-1.5 rounded-[var(--radius-sm)] text-text-faint hover:text-text hover:bg-surface-hover transition-colors"
            title={fullscreen ? "Exit full window (Esc)" : "Expand to whole page"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4 text-accent" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* Close preview panel (if not in fullscreen and callback provided) */}
          {!fullscreen && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-[var(--radius-sm)] text-text-faint hover:text-danger hover:bg-danger-soft transition-colors ml-1"
              title="Close preview panel (full-width editor)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar when preview is ready */}
      {generation && generation.status === "complete" && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-surface text-xs text-text-muted shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 15))}
              className="p-1 rounded hover:bg-surface-hover text-text-faint hover:text-text"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] font-mono w-10 text-center">{zoom}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(200, z + 15))}
              className="p-1 rounded hover:bg-surface-hover text-text-faint hover:text-text"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(100)}
              className="p-1 rounded hover:bg-surface-hover text-text-faint hover:text-text ml-1"
              title="Reset zoom"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {generation.output_document_url && (
              <a
                href={generation.output_document_url}
                download={`${generation.output_filename || 'Resume'}.docx`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-surface hover:bg-surface-hover text-[11px] font-medium text-text transition-colors cursor-pointer"
                title={`Download ${generation.output_filename || 'Resume'}.docx`}
              >
                <Download className="h-3 w-3" /> DOCX
              </a>
            )}
            {(generation.output_pdf_download_url || generation.output_pdf_url) && (
              <a
                href={generation.output_pdf_download_url || generation.output_pdf_url!}
                download={`${generation.output_filename || 'Resume'}.pdf`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent hover:bg-accent-strong text-[11px] font-semibold text-white transition-colors cursor-pointer"
                title={`Download ${generation.output_filename || 'Resume'}.pdf`}
              >
                <Download className="h-3 w-3" /> PDF
              </a>
            )}
          </div>
        </div>
      )}

      {/* Main Preview Canvas */}
      <div
        className={`flex-1 bg-bg/90 overflow-auto flex items-center justify-center relative ${
          fullscreen ? "p-0 m-0" : "p-4"
        }`}
      >
        {rendering ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center animate-fade-in">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Compiling Document Preview</p>
              <p className="text-xs text-text-muted mt-1 font-mono">{renderStep || "Processing candidate profile..."}</p>
            </div>
          </div>
        ) : generation && generation.output_pdf_url ? (
          <div
            className={`transition-transform duration-150 origin-top flex justify-center ${
              fullscreen ? "w-full h-full p-0 m-0" : "w-full h-full"
            }`}
            style={{ transform: `scale(${zoom / 100})` }}
          >
            <iframe
              src={`${generation.output_pdf_url}#toolbar=0&navpanes=0`}
              className={`w-full h-full bg-white shadow-xl ${
                fullscreen ? "border-none rounded-none min-h-[calc(100vh-90px)]" : "min-h-[600px] rounded-md border border-border"
              }`}
              title="CV Document Preview"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3.5 max-w-sm text-center p-6">
            <div className="h-12 w-12 rounded-xl bg-surface border border-border flex items-center justify-center text-text-faint">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-text">No Preview Rendered Yet</h5>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Click <strong>Render Preview</strong> to test this profile against the selected template and view the final PDF live.
              </p>
            </div>
            <Button size="sm" onClick={handleRenderPreview} disabled={!selectedTemplateId}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Render Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
