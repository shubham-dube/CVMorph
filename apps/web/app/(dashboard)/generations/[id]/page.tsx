"use client";

import { GenerationDetailView } from "@/features/generations";

export default function GenerationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <GenerationDetailView params={params} />;
}
