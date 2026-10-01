"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LoginView } from "@/features/auth";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      }
    >
      <LoginView />
    </Suspense>
  );
}