"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, ArrowRight, ShieldCheck, Eye, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { BRAND } from "@/lib/branding";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api-client";

const PITCH = [
  { icon: Wand2, text: "Upload any CV — any layout, any format — and get it into your template in minutes." },
  { icon: Eye, text: "Every AI-extracted fact carries a confidence score and a link back to its source." },
  { icon: ShieldCheck, text: "Nothing goes to a client until a recruiter reviews and approves it." },
];

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.push(params.get("next") || "/candidates");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Sign in failed. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-[13px] font-medium text-text-muted mb-1.5 block">Email</label>
        <Input
          type="email"
          required
          autoFocus
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="text-[13px] font-medium text-text-muted mb-1.5 block">Password</label>
        <Input
          type="password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Sign in <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-bg-elevated border-r border-border p-12 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent-strong), transparent 70%)" }}
        />

        <div className="relative flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-accent text-[color:var(--accent-contrast)]">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <span className="text-base font-semibold tracking-tight text-text">{BRAND.name}</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-text tracking-tight">
            Every candidate CV,<br />in your template,<br />
            <span className="text-accent">without the copy-paste.</span>
          </h1>
          <div className="mt-10 space-y-5">
            {PITCH.map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-surface border border-border">
                  <p.icon className="h-3.5 w-3.5 text-accent" />
                </div>
                <p className="text-[13px] text-text-muted leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-text-faint">{BRAND.tagline}</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-8 bg-bg">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-accent text-[color:var(--accent-contrast)]">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <span className="text-base font-semibold tracking-tight text-text">{BRAND.name}</span>
          </div>

          <h2 className="text-xl font-semibold text-text">Sign in</h2>
          <p className="text-sm text-text-muted mt-1 mb-8">
            Welcome back — enter your details to continue.
          </p>

          <Suspense
            fallback={
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>

          <p className="text-xs text-text-faint mt-8 text-center">
            Google SSO is coming in a later release — see the platform roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}