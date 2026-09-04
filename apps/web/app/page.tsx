"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Zap,
  Cpu,
  Layers,
  Download,
  Eye,
  Settings2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BRAND } from "@/lib/branding";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"before" | "after">("after");

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent-soft selection:text-text">
      {/* Ambient glow background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div
          className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] rounded-full opacity-20 blur-[130px]"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, rgba(139,124,246,0) 70%)" }}
        />
        <div
          className="absolute top-[40%] -left-[10%] w-[500px] h-[500px] rounded-full opacity-10 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--accent-strong) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-[10%] -right-[10%] w-[600px] h-[600px] rounded-full opacity-10 blur-[140px]"
          style={{ background: "radial-gradient(circle, #38bdf8 0%, transparent 70%)" }}
        />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-bg/80 border-b border-border/80 transition-all">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-[color:var(--accent-contrast)] shadow-md shadow-accent/20 group-hover:scale-105 transition-transform">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-text group-hover:text-accent-strong transition-colors">
              {BRAND.name}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-text-muted">
            <a href="#features" className="hover:text-text transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-text transition-colors">Workflow</a>
            <a href="#showcase" className="hover:text-text transition-colors">Template Engine</a>
          </nav>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-20 rounded-md bg-surface animate-pulse" />
            ) : isAuthenticated ? (
              <Button size="sm" onClick={() => router.push("/candidates")}>
                Open Studio <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs font-medium text-text-muted hover:text-text transition-colors px-3 py-1.5"
                >
                  Sign In
                </Link>
                <Button size="sm" onClick={() => router.push("/login")}>
                  Get Started <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 md:pt-28 md:pb-24 px-6 max-w-6xl mx-auto text-center">
        {/* Pill badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-accent/30 bg-accent-soft text-accent text-xs font-medium mb-6 shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Intelligent CV Transformation & Template Automation</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-text leading-[1.12] max-w-4xl mx-auto">
          Every candidate resume, in your branded template,{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-strong to-[#38bdf8]">
            at the click of a button.
          </span>
        </h1>

        {/* Hero Subhead */}
        <p className="mt-6 text-base sm:text-lg text-text-muted max-w-2xl mx-auto leading-relaxed">
          Eliminate hours of manual copying and misaligned styling. CVMorph extracts structured candidate profiles, verifies factual provenance, and compiles pixel-perfect DOCX and PDF documents.
        </p>

        {/* CTA Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <Button
            size="lg"
            className="w-full sm:w-auto h-12 px-7 text-sm font-semibold shadow-lg shadow-accent/25"
            onClick={() => router.push(isAuthenticated ? "/candidates" : "/login")}
          >
            {isAuthenticated ? "Launch Dashboard" : "Start Formatting Free"} <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-6 rounded-[var(--radius-md)] border border-border bg-surface hover:bg-surface-hover text-sm font-medium text-text transition-colors"
          >
            See Live Workflow <ChevronDown className="h-4 w-4 ml-1.5 text-text-muted" />
          </a>
        </div>

        {/* Interactive Transformation Showcase Mockup */}
        <div className="mt-14 relative mx-auto max-w-4xl rounded-[var(--radius-lg)] border border-border/80 bg-surface/70 backdrop-blur-xl p-4 sm:p-6 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-border pb-3.5 mb-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-danger/60" />
              <div className="h-3 w-3 rounded-full bg-confidence-medium/60" />
              <div className="h-3 w-3 rounded-full bg-confidence-high/60" />
              <span className="text-xs text-text-faint ml-2 font-mono">cvmorph-studio // live-renderer</span>
            </div>

            <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-[var(--radius-sm)] border border-border">
              <button
                onClick={() => setActiveTab("before")}
                className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-all cursor-pointer ${
                  activeTab === "before" ? "bg-surface text-text shadow-xs" : "text-text-faint hover:text-text"
                }`}
              >
                Raw Source CV
              </button>
              <button
                onClick={() => setActiveTab("after")}
                className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "after" ? "bg-accent text-white shadow-xs" : "text-text-faint hover:text-text"
                }`}
              >
                <Sparkles className="h-3 w-3" /> Branded Output
              </button>
            </div>
          </div>

          {activeTab === "after" ? (
            <div className="bg-bg-elevated rounded-[var(--radius-md)] p-6 sm:p-8 text-left border border-border/70 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-5">
                <div>
                  <h3 className="text-2xl font-bold text-text">Alex Morgan</h3>
                  <p className="text-sm font-semibold text-accent mt-0.5">Lead Cloud & Systems Architect</p>
                  <p className="text-xs text-text-faint mt-1">alex.morgan@cloudsystems.io • San Francisco, CA</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-confidence-high-soft text-confidence-high border border-confidence-high/30 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Verified Provenance
                  </span>
                  <span className="text-[11px] font-medium bg-surface px-2.5 py-1 rounded-md border border-border text-text-muted">
                    Template: Classic Professional
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-faint mb-2">Executive Summary</h4>
                <ul className="space-y-1.5 text-xs text-text-muted leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-accent">•</span>
                    <span>10+ years of distributed cloud systems architecture leading high-throughput infrastructure handling <strong>50,000+ requests/second</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent">•</span>
                    <span>Pioneered automated container orchestration and serverless pipelines, cutting infrastructure operational spend by <strong>$340,000 annually</strong>.</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-faint mb-2">Technical Capabilities</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-md bg-surface border border-border/60">
                    <span className="text-text-faint font-medium">Languages & Runtimes:</span>{" "}
                    <span className="text-text">Go, Python, TypeScript, Rust, SQL</span>
                  </div>
                  <div className="p-2.5 rounded-md bg-surface border border-border/60">
                    <span className="text-text-faint font-medium">Cloud & Infrastructure:</span>{" "}
                    <span className="text-text">AWS, Kubernetes, Terraform, PostgreSQL, Redis, Docker</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-bg-elevated rounded-[var(--radius-md)] p-6 sm:p-8 text-left border border-border/70 font-mono text-xs text-text-muted space-y-3 opacity-80">
              <p className="text-danger font-semibold">// Raw unformatted CV text prior to parsing</p>
              <p>ALEX MORGAN | Lead Cloud Architect | email: alex.morgan@cloudsystems.io | San Francisco, CA</p>
              <p>SUMMARY: 10+ yrs distributed cloud systems, high throughput microservices, kubernetes, terraform, aws, go, rust</p>
              <p>EXPERIENCE: Staff Systems Architect at CloudCorp (2021-Present) - Led engineering team of 14, orchestrated multi-region Kubernetes deployments, reduced downtime to 99.99%.</p>
            </div>
          )}
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section id="features" className="py-20 px-6 max-w-6xl mx-auto border-t border-border/60">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
            Engineered for recruiting speed and formatting perfection
          </h2>
          <p className="mt-3 text-sm text-text-muted leading-relaxed">
            Every layer of CVMorph is designed to provide complete control to recruiting teams while eliminating repetitive formatting tasks.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: Cpu,
              title: "Adaptive Extraction",
              desc: "Parses diverse resume layouts, unformatted tables, multi-column designs, and exports with high-fidelity semantic understanding.",
            },
            {
              icon: Eye,
              title: "Verified Fact Provenance",
              desc: "Zero hallucination tolerance. Hover over any extracted bullet or skill to inspect the exact sentence and quotation from the source resume.",
            },
            {
              icon: Layers,
              title: "Dual-Engine Rendering",
              desc: "Native support for Microsoft Word (.docx) through docxtpl and high-precision scientific typography via XeLaTeX (.tex.j2).",
            },
            {
              icon: Zap,
              title: "Live Preview Studio",
              desc: "Split-screen review environment. Edit details and trigger live PDF rendering directly alongside your profile editor.",
            },
            {
              icon: Settings2,
              title: "Dynamic Naming Patterns",
              desc: "Automatically format generated filenames according to your agency standard: e.g. 'Resume - {Name} - {Role}'.",
            },
            {
              icon: ShieldCheck,
              title: "Single Sign-On (Google)",
              desc: "Instant onboarding with verified Google accounts. Automatically assigns individual and organization workspaces with full tenant isolation.",
            },
          ].map((feat, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-lg)] border border-border bg-surface/60 p-6 flex flex-col gap-3 hover:border-accent/40 hover:bg-surface transition-all group"
            >
              <div className="h-10 w-10 rounded-[10px] bg-accent-soft border border-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                <feat.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-text mt-1">{feat.title}</h3>
              <p className="text-xs text-text-muted leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-6 max-w-6xl mx-auto border-t border-border/60">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
            From raw resume to branded document in three steps
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {[
            {
              step: "01",
              title: "Upload CV",
              desc: "Drop standard PDF or DOCX files. The background pipeline extracts text layers and structures candidate information.",
            },
            {
              step: "02",
              title: "Review & Refine",
              desc: "Inspect candidate details on the left, verify source quotes, polish bullet points, and preview output formatting.",
            },
            {
              step: "03",
              title: "Export & Share",
              desc: "Select your branded template and download clean Word or PDF files immediately ready for hiring managers.",
            },
          ].map((s, idx) => (
            <div key={idx} className="relative rounded-[var(--radius-lg)] border border-border bg-surface p-7 flex flex-col gap-3">
              <span className="text-3xl font-black text-accent/40">{s.step}</span>
              <h3 className="text-lg font-bold text-text">{s.title}</h3>
              <p className="text-xs text-text-muted leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Template Showcase Section */}
      <section id="showcase" className="py-20 px-6 max-w-6xl mx-auto border-t border-border/60">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
              Precision Template Engine
            </h2>
            <p className="mt-2 text-sm text-text-muted max-w-xl">
              CVMorph includes a pre-seeded system library and allows admins to upload custom Microsoft Word or LaTeX templates anytime.
            </p>
          </div>
          <Button size="sm" onClick={() => router.push(isAuthenticated ? "/templates" : "/login")}>
            View Template Library <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-3">
            <div className="h-36 rounded-[var(--radius-md)] bg-bg-elevated border border-border flex items-center justify-center text-text-faint font-mono text-xs">
              [Executive Single-Column DOCX]
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-text">Classic Professional</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 uppercase">
                System Library
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Clean single-column executive layout with clear typographic hierarchy, structured bullet highlights, and comprehensive employment sections.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-3">
            <div className="h-36 rounded-[var(--radius-md)] bg-bg-elevated border border-border flex items-center justify-center text-text-faint font-mono text-xs">
              [Modern Top-Header DOCX]
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-text">Contemporary Header</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 uppercase">
                System Library
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Modern top-header design with horizontal contact band, streamlined technical skills table, and refined project breakdowns.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-3">
            <div className="h-36 rounded-[var(--radius-md)] bg-bg-elevated border border-border flex items-center justify-center text-text-faint font-mono text-xs">
              [Two-Column Accent DOCX]
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-text">Modern Sidebar</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 uppercase">
                System Library
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Distinctive two-column accent layout featuring a compact sidebar for contact and skills with prominent career narrative.
            </p>
          </div>
        </div>
      </section>

      {/* Call to action footer banner */}
      <section className="py-20 px-6 max-w-5xl mx-auto text-center">
        <div className="relative rounded-2xl border border-accent/30 bg-gradient-to-b from-accent-soft via-surface to-bg p-10 sm:p-14 overflow-hidden">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text">
            Upgrade your CV formatting workflow today
          </h2>
          <p className="mt-4 text-sm text-text-muted max-w-xl mx-auto leading-relaxed">
            Deliver consistent, branded, client-approved candidate profiles in minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <Button
              size="lg"
              className="h-12 px-8 text-sm font-semibold"
              onClick={() => router.push(isAuthenticated ? "/candidates" : "/login")}
            >
              Get Started with {BRAND.name} <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70 py-10 px-6 max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-faint">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-[6px] bg-accent text-[color:var(--accent-contrast)] flex items-center justify-center text-[10px] font-bold">
            C
          </div>
          <span>{BRAND.name} • CV Intelligence & Formatting</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/login" className="hover:text-text transition-colors">Sign In</Link>
          <a href="#features" className="hover:text-text transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-text transition-colors">Workflow</a>
        </div>
      </footer>
    </div>
  );
}