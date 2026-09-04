/**
 * Type-safe API client for the CVMorph backend.
 *
 * Every backend call in the app goes through this module — no raw fetch()
 * calls in components/pages. Mirrors docs/api-reference.md exactly; if the
 * backend contract changes, this is the one file to update.
 */
import type {
  CandidateListResponse,
  CandidateProfile,
  CandidateResponse,
  DocumentListResponse,
  DocumentUploadResponse,
  GenerationListResponse,
  GenerationResponse,
  JobStatusResponse,
  OrgBranding,
  OrgResponse,
  ProfileResponse,
  ReviewEventResponse,
  TemplateResponse,
  TokenResponse,
  UsageSummaryResponse,
  UserResponse,
} from "./types";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/v1";

const TOKEN_KEY = "cvmorph_access_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    // Mirrored into a plain cookie so the Next.js middleware can gate
    // dashboard routes server-side. See docs/FRONTEND_BACKEND_GAPS.md §1
    // for why this isn't httpOnly and what should replace it.
    document.cookie = `cvmorph_session=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = "cvmorph_session=; path=/; max-age=0";
  }
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    const message =
      typeof detail === "string"
        ? detail
        : (detail as { message?: string })?.message ?? JSON.stringify(detail);
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const isForm = options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? body);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  googleLogin: (idToken: string, email?: string, name?: string, photoUrl?: string) =>
    request<TokenResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken, email, name, photo_url: photoUrl }),
    }),
  me: () => request<UserResponse>("/auth/me"),
};

// ── Documents ────────────────────────────────────────────────────────────────

export const documentsApi = {
  upload: (file: File, opts?: { candidateId?: string; extractionInstructions?: string }) => {
    const form = new FormData();
    form.append("file", file);
    const params = new URLSearchParams();
    if (opts?.candidateId) params.set("candidate_id", opts.candidateId);
    if (opts?.extractionInstructions) params.set("extraction_instructions", opts.extractionInstructions);
    const qs = params.toString();
    return request<DocumentUploadResponse>(`/documents${qs ? `?${qs}` : ""}`, {
      method: "POST",
      body: form,
    });
  },
  list: (candidateId?: string) =>
    request<DocumentListResponse>(`/documents${candidateId ? `?candidate_id=${candidateId}` : ""}`),
};

// ── Jobs ─────────────────────────────────────────────────────────────────────

export const jobsApi = {
  get: (jobId: string) => request<JobStatusResponse>(`/jobs/${jobId}`),
};

// Terminal success only when extraction is done
const TERMINAL_SUCCESS = ["ready_for_review", "complete"];

/** Polls a job until it reaches a terminal state. Calls onProgress on every tick. */
export async function pollJob(
  jobId: string,
  onProgress?: (status: JobStatusResponse["status"]) => void,
  maxAttempts = 120,
  intervalMs = 2000
): Promise<JobStatusResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await jobsApi.get(jobId);
    onProgress?.(job.status);
    if (TERMINAL_SUCCESS.includes(job.status)) return job;
    if (job.status === "failed") throw new ApiError(500, job.error_message ?? "Job failed");
    if (job.status === "cancelled") throw new ApiError(499, "Job was cancelled");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new ApiError(408, "Timed out waiting for job to finish");
}

/** Polls a generation until it reaches a terminal state. */
export async function pollGeneration(
  generationId: string,
  onProgress?: (status: string) => void,
  maxAttempts = 120,
  intervalMs = 2000
): Promise<import("./types").GenerationResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const gen = await generationsApi.get(generationId);
    onProgress?.(gen.status);
    if (gen.status === "complete") return gen;
    if (gen.status === "failed") throw new ApiError(500, gen.error_message ?? "Generation failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new ApiError(408, "Timed out waiting for generation to finish");
}

// ── Candidates ───────────────────────────────────────────────────────────────

export const candidatesApi = {
  list: (params?: { page?: number; pageSize?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("page_size", String(params.pageSize));
    if (params?.search) qs.set("search", params.search);
    const s = qs.toString();
    return request<CandidateListResponse>(`/candidates${s ? `?${s}` : ""}`);
  },
  create: (name: string) =>
    request<CandidateResponse>("/candidates", { method: "POST", body: JSON.stringify({ name }) }),
  get: (id: string) => request<CandidateResponse>(`/candidates/${id}`),
  getProfile: (id: string) => request<ProfileResponse>(`/candidates/${id}/profile`),
  patchProfile: (
    id: string,
    body: {
      field_path: string;
      action: "confirm" | "edit" | "remove";
      old_value: unknown;
      new_value: unknown;
      profile: CandidateProfile;
    }
  ) =>
    request<ProfileResponse>(`/candidates/${id}/profile`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  approveProfile: (id: string) =>
    request<{ status: string; profile_id: string; approved_at: string; message: string }>(
      `/candidates/${id}/profile/approve`,
      { method: "POST" }
    ),
  reviewEvents: (id: string) => request<ReviewEventResponse[]>(`/candidates/${id}/profile/review-events`),
};

// ── Generations ──────────────────────────────────────────────────────────────

export const generationsApi = {
  create: (candidateId: string, templateId: string, formattingInstructions?: string) =>
    request<GenerationResponse>("/generations", {
      method: "POST",
      body: JSON.stringify({
        candidate_id: candidateId,
        template_id: templateId,
        formatting_instructions: formattingInstructions ?? null,
      }),
    }),
  get: (id: string) => request<GenerationResponse>(`/generations/${id}`),
  list: (params?: { candidateId?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.candidateId) qs.set("candidate_id", params.candidateId);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("page_size", String(params.pageSize));
    const s = qs.toString();
    return request<GenerationListResponse>(`/generations${s ? `?${s}` : ""}`);
  },
};

// ── Templates ────────────────────────────────────────────────────────────────

export const templatesApi = {
  list: () => request<TemplateResponse[]>("/templates"),
  get: (id: string) => request<TemplateResponse>(`/templates/${id}`),
  create: (file: File | null, name: string, description?: string, configJson?: object) => {
    const form = new FormData();
    if (file) form.append("file", file);
    form.append("name", name);
    if (description) form.append("description", description);
    form.append("config_json", JSON.stringify(configJson ?? {}));
    return request<TemplateResponse>("/templates", { method: "POST", body: form });
  },
  update: (id: string, body: Partial<Pick<TemplateResponse, "name" | "description" | "config_json">>) =>
    request<TemplateResponse>(`/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) => request<void>(`/templates/${id}`, { method: "DELETE" }),
  getDownloadUrl: (id: string) =>
    request<{ download_url: string; name: string; template_type: string }>(`/templates/${id}/download`),
};

// ── Orgs ─────────────────────────────────────────────────────────────────────

export const orgsApi = {
  me: () => request<OrgResponse>("/orgs/me"),
  usage: (period: "all_time" | "this_month" = "all_time") =>
    request<UsageSummaryResponse>(`/orgs/me/usage?period=${period}`),
  updateOrg: (body: { name?: string; naming_pattern?: string }) =>
    request<OrgResponse>("/orgs/me", { method: "PATCH", body: JSON.stringify(body) }),
  updateBranding: (branding: Partial<OrgBranding>) =>
    request<OrgResponse>("/orgs/me/branding", { method: "PATCH", body: JSON.stringify(branding) }),
};

// ── Synchronous extraction (preview/sandbox use) ────────────────────────────

export const extractApi = {
  extract: (file: File, extractionInstructions?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (extractionInstructions) form.append("extraction_instructions", extractionInstructions);
    return request<{ success: boolean; filename: string; profile: CandidateProfile }>("/cv/extract", {
      method: "POST",
      body: form,
    });
  },
};