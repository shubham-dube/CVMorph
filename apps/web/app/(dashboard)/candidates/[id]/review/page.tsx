"use client";

import { ReviewStudioView } from "@/features/review";

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReviewStudioView params={params} />;
}