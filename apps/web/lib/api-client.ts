/**
 * Type-safe API client for the CV Platform backend.
 *
 * All API calls go through this module — no raw fetch() calls in components.
 * Epic 4 (review UI) will flesh this out with all the endpoints.
 *
 * Usage:
 *   import { apiClient } from "@/lib/api-client";
 *   const profile = await apiClient.getProfile(candidateId);
 */

import type {
  CandidateProfile,
  DocumentUploadResponse,
  GenerationResponse,
  JobStatusResponse,
} from "@cv-platform/shared-types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const { token, ...fetchOptions } = options ?? {};
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchOptions.headers ?? {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(`API error ${status}: ${detail}`);
  }
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  options: { extractionInstructions?: string; token: string }
): Promise<DocumentUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (options.extractionInstructions) {
    form.append("extraction_instructions", options.extractionInstructions);
  }
  const res = await fetch(`${BASE_URL}/v1/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${options.token}` },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export async function getJobStatus(
  jobId: string,
  token: string
): Promise<JobStatusResponse> {
  return apiFetch<JobStatusResponse>(`/v1/jobs/${jobId}`, { token });
}

// ── Candidates ────────────────────────────────────────────────────────────────

export async function getCandidateProfile(
  candidateId: string,
  token: string
): Promise<CandidateProfile> {
  return apiFetch<CandidateProfile>(`/v1/candidates/${candidateId}/profile`, { token });
}

export async function patchCandidateProfile(
  candidateId: string,
  profile: CandidateProfile,
  token: string
): Promise<CandidateProfile> {
  return apiFetch<CandidateProfile>(`/v1/candidates/${candidateId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(profile),
    token,
  });
}

export async function approveProfile(
  candidateId: string,
  token: string
): Promise<void> {
  await apiFetch(`/v1/candidates/${candidateId}/profile/approve`, {
    method: "POST",
    token,
  });
}

// ── Generations ───────────────────────────────────────────────────────────────

export async function createGeneration(
  candidateId: string,
  templateId: string,
  options: { formattingInstructions?: string; token: string }
): Promise<GenerationResponse> {
  return apiFetch<GenerationResponse>(`/v1/generations`, {
    method: "POST",
    body: JSON.stringify({
      candidate_id: candidateId,
      template_id: templateId,
      formatting_instructions: options.formattingInstructions ?? null,
    }),
    token: options.token,
  });
}

export async function getGeneration(
  generationId: string,
  token: string
): Promise<GenerationResponse> {
  return apiFetch<GenerationResponse>(`/v1/generations/${generationId}`, { token });
}
