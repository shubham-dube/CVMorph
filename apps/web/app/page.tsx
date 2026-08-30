"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export default function RootPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? "/candidates" : "/login");
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg">
      <Loader2 className="h-5 w-5 animate-spin text-text-faint" />
    </div>
  );
}