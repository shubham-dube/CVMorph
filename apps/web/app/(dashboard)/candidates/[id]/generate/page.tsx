"use client";

import { CandidateGenerateView } from "@/features/candidates";

export default function GeneratePage({ params }: { params: Promise<{ id: string }> }) {
  return <CandidateGenerateView params={params} />;
}
