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
  RotateCw,
  RotateCcw,
  Sparkles,
  Maximize2,
  Minimize2,
  Layers,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { templatesApi, generationsApi, pollGeneration, ApiError } from "@/lib/api-client";
import type { TemplateResponse, GenerationResponse } from "@/lib/types";

interface PreviewPanelProps {
  candidateId: string;
  candidateName: string;
  profileId?: string;
  profileTitle?: string;
  onClose?: () => void;
}

export function PreviewPanel({
  candidateId,
  candidateName,
  profileId,
  profileTitle,
  onClose,
}: PreviewPanelProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [rendering, setRendering] = useState(false);
  const [renderStep, setRenderStep] = useState<string>("");
  const [generation, setGeneration] = useState<GenerationResponse | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
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
    queryKey: ["generations", candidateId, profileId],
    queryFn: () => generationsApi.list({ candidateId, pageSize: 5 }),
    enabled: !!candidateId,
  });

  useEffect(() => {
    if (recentGens?.items && recentGens.items.length > 0) {
      // Find generation for this specific profile if profileId provided, or latest complete
      const matchingGen = profileId
        ? recentGens.items.find((g) => g.profile_id === profileId && g.status === "complete")
        : recentGens.items.find((g) => g.status === "complete");
      if (matchingGen) {
        setGeneration(matchingGen);
      } else if (!profileId && recentGens.items[0].status === "complete") {
        setGeneration(recentGens.items[0]);
      }
    }
  }, [recentGens, profileId]);

  async function handleRenderPreview() {
    if (!selectedTemplateId) {
      toast.error("Please select a template to generate.");
      return;
    }

    setRendering(true);
    setRenderStep("Preparing profile data...");
    try {
      const initial = await generationsApi.create(candidateId, selectedTemplateId, undefined, profileId);
      setRenderStep("Applying template typography & layout...");

      const completed = await pollGeneration(initial.id, (status) => {
        if (status === "rendering") {
          setRenderStep("Formatting executive PDF...");
        }
      });

      setGeneration(completed);
      toast.success("Branded resume generated successfully!");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Document generation failed.";
      toast.error(msg);
    } finally {
      setRendering(false);
      setRenderStep("");
    }
  }

  const handleZoomIn = () => setZoom((z) => Math.min(220, z + 15));
  const handleZoomOut = () => setZoom((z) => Math.max(50, z - 15));
  const handleRotateCw = () => setRotation((r) => (r + 90) % 360);
  const handleRotateCcw = () => setRotation((r) => (r + 270) % 360);
  const handleResetView = () => {
    setZoom(100);
    setRotation(0);
  };

  const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);

  // Dynamic geometry calculation for crisp vector rendering and rotation bounding box
  const isLandscape = rotation === 90 || rotation === 270;
  const baseWidth = fullscreen ? 920 : 800;
  const baseHeight = Math.round(baseWidth * 1.414); // Standard A4 ratio
  const scaledWidth = Math.round(baseWidth * (zoom / 100));
  const scaledHeight = Math.round(baseHeight * (zoom / 100));

  // Outer bounds swap dimensions if rotated 90° or 270° to avoid clipping
  const outerWidth = isLandscape ? scaledHeight : scaledWidth;
  const outerHeight = isLandscape ? scaledWidth : scaledHeight;

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
            <h4 className="text-xs font-semibold text-text truncate">
              {profileTitle ? `${profileTitle} • Live Preview` : "Live Resume Preview"}
            </h4>
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
                Generating...
              </>
            ) : generation ? (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Update Document
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Generate Resume
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border/60 bg-surface text-xs text-text-muted shrink-0">
          <div className="flex items-center gap-1">
            {/* Zoom Controls */}
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 50}
              className="p-1.5 rounded hover:bg-surface-hover text-text-faint hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Zoom out (-15%)"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>

            {/* Quick zoom presets */}
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="text-[11px] font-mono rounded border border-border bg-surface px-1.5 py-0.5 text-text focus:outline-none focus:border-accent cursor-pointer"
              title="Select zoom level"
            >
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={90}>90%</option>
              <option value={100}>100%</option>
              <option value={115}>115%</option>
              <option value={130}>130%</option>
              <option value={150}>150%</option>
              <option value={175}>175%</option>
              <option value={200}>200%</option>
            </select>

            <button
              onClick={handleZoomIn}
              disabled={zoom >= 220}
              className="p-1.5 rounded hover:bg-surface-hover text-text-faint hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Zoom in (+15%)"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>

            <div className="h-3.5 w-px bg-border mx-1" />

            {/* Rotation Controls */}
            <button
              onClick={handleRotateCcw}
              className="p-1.5 rounded hover:bg-surface-hover text-text-faint hover:text-text transition-colors"
              title="Rotate 90° counter-clockwise"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={handleRotateCw}
              className="p-1.5 rounded hover:bg-surface-hover text-text-faint hover:text-text transition-colors"
              title="Rotate 90° clockwise"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            {rotation !== 0 && (
              <span className="text-[10px] font-mono px-1 rounded bg-accent-soft text-accent">
                {rotation}°
              </span>
            )}

            {/* Reset view */}
            {(zoom !== 100 || rotation !== 0) && (
              <button
                onClick={handleResetView}
                className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors ml-0.5"
                title="Reset zoom & rotation"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
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
        className={`flex-1 bg-bg/90 overflow-auto flex items-start justify-center relative ${
          fullscreen ? "p-6" : "p-4"
        }`}
      >
        {rendering ? (
          <div className="m-auto flex flex-col items-center gap-3 p-8 text-center animate-fade-in">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Generating Branded Resume</p>
              <p className="text-xs text-text-muted mt-1 font-mono">{renderStep || "Formatting candidate document..."}</p>
            </div>
          </div>
        ) : generation && generation.output_pdf_url ? (
          <div
            className="m-auto relative flex items-center justify-center transition-all duration-200"
            style={{
              width: `${outerWidth}px`,
              height: `${outerHeight}px`,
              minWidth: `${outerWidth}px`,
              minHeight: `${outerHeight}px`,
            }}
          >
            <div
              className="absolute transition-transform duration-200 ease-out origin-center"
              style={{
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
                transform: `rotate(${rotation}deg)`,
              }}
            >
              <iframe
                src={`${generation.output_pdf_url}#toolbar=0&navpanes=0&view=FitH`}
                className="w-full h-full bg-white shadow-2xl rounded-md border border-border"
                title="CV Document Preview"
              />
            </div>
          </div>
        ) : (
          <div className="m-auto flex flex-col items-center gap-3.5 max-w-sm text-center p-6">
            <div className="h-12 w-12 rounded-xl bg-surface border border-border flex items-center justify-center text-text-faint">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-text">Resume Not Yet Generated</h5>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Click <strong>Generate Resume</strong> to format this candidate profile with the selected corporate template and view the live PDF.
              </p>
            </div>
            <Button size="sm" onClick={handleRenderPreview} disabled={!selectedTemplateId}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Generate Resume
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
