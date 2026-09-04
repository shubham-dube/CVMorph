"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase";
import { BRAND } from "@/lib/branding";

function LoginFormInner() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);

  const firebaseReady = isFirebaseConfigured();

  async function handleGoogleSignIn() {
    if (!firebaseReady) {
      toast.error(
        "Firebase credentials needed. Please check your NEXT_PUBLIC_FIREBASE_* keys in apps/web/.env",
        { duration: 6000 }
      );
      return;
    }

    setLoading(true);
    try {
      await loginWithGoogle();
      toast.success("Signed in successfully with Google.");
      router.push(params.get("next") || "/candidates");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign in failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Mobile brand header */}
      <div className="lg:hidden flex items-center gap-2 mb-6 justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-[color:var(--accent-contrast)]">
          <Sparkles className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold tracking-tight text-text">{BRAND.name}</span>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-text">Welcome to {BRAND.name}</h2>
        <p className="text-sm text-text-muted mt-1.5">
          Sign in with your verified Google account to access your workspace.
        </p>
      </div>

      {/* Configuration notice if keys missing */}
      {!firebaseReady && (
        <div className="rounded-[var(--radius-md)] border border-confidence-medium/30 bg-confidence-medium-soft p-4 text-xs text-text-muted space-y-2">
          <div className="flex items-center gap-2 text-confidence-medium font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Firebase Setup
          </div>
          <p>
            Please ensure Firebase credentials are added to <code className="bg-surface px-1 py-0.5 rounded text-text">apps/web/.env</code>.
          </p>
        </div>
      )}

      {/* Google Sign-In Button */}
      <div className="space-y-3 pt-2">
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3.5 h-12 rounded-[var(--radius-md)] border border-border bg-surface hover:bg-surface-hover active:scale-[0.99] text-sm font-semibold text-text shadow-sm hover:border-border-strong transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          ) : (
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>{loading ? "Authenticating with Google..." : "Continue with Google"}</span>
        </button>
      </div>

      <p className="text-[11px] text-text-faint text-center leading-relaxed pt-2">
        By signing in, you agree to our Terms of Service and Privacy Policy. All candidate data is securely encrypted in transit and at rest.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Visual Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-bg-elevated border-r border-border p-12 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full opacity-15 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent-strong), transparent 70%)" }}
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-[color:var(--accent-contrast)] shadow-lg shadow-accent/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-text">{BRAND.name}</span>
        </div>

        <div className="relative max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            <ShieldCheck className="h-3.5 w-3.5" />
            Enterprise CV Intelligence
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-text leading-[1.15]">
            Transform candidate resumes into client-ready profiles,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-strong">
              instantly.
            </span>
          </h1>

          <p className="text-sm text-text-muted leading-relaxed max-w-md">
            CVMorph standardizes formatting, guarantees verified extraction provenance, and produces flawless DOCX and PDF documents on your branded templates.
          </p>

          <div className="space-y-3 pt-2">
            {[
              "Single Sign-On with verified Google authentication",
              "Interactive split-screen CV review studio",
              "High-precision DOCX & XeLaTeX template rendering engines",
            ].map((feat, idx) => (
              <div key={idx} className="flex items-center gap-2.5 text-xs text-text-muted">
                <CheckCircle2 className="h-4 w-4 text-confidence-high shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-text-faint">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
      </div>

      {/* Auth Panel with Suspense */}
      <div className="flex flex-1 items-center justify-center p-8 bg-bg">
        <Suspense
          fallback={
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          }
        >
          <LoginFormInner />
        </Suspense>
      </div>
    </div>
  );
}