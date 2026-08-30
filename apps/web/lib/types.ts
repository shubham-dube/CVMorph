/**
 * Canonical Candidate Profile — TypeScript types.
 *
 * Inlined from @cv-platform/shared-types so this web app is a fully
 * standalone package (per the "frontend zip only" deliverable). If/when
 * this is folded back into the monorepo, re-point these imports at the
 * shared package instead of deleting it — keep the backend Pydantic
 * schema (apps/api/app/schemas/candidate_profile.py) as the source of
 * truth either way.
 */

// ── Provenance / trust primitives ───────────────────────────────────────────

export type SourceType = "source" | "verified_transformation" | "ai_generated";

export interface Provenance {
  confidence: number; // [0, 1]
  source_type: SourceType;
  evidence: string | null;
}

// ── Section models ───────────────────────────────────────────────────────────

export interface Meta {
  org_id: string;
  candidate_id: string;
  source_document_id: string;
  extraction_model: string;
  extraction_version: string;
  extraction_instructions: string | null;
  overall_confidence: number;
}

export interface Candidate {
  full_name: string;
  role_title: string;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface SummaryBullet extends Provenance {
  text: string;
}

export interface CareerSummary {
  bullets: SummaryBullet[];
}

export interface SkillGroup extends Provenance {
  category: string;
  skills: string[];
}

export interface TechnicalSkills {
  groups: SkillGroup[];
}

export type EducationType = "degree" | "certification";

export interface EducationItem extends Provenance {
  type: EducationType;
  text: string;
}

export interface Education {
  has_certifications: boolean;
  items: EducationItem[];
}

export interface ResponsibilityBullet extends Provenance {
  text: string;
}

export interface EmploymentEntry {
  company: string;
  client: string | null;
  role: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  duration_display: string;
  project_name: string | null;
  technology_used: string[];
  project_description: string | null;
  responsibilities: ResponsibilityBullet[];
  confidence: number;
}

export interface CandidateProfile {
  meta: Meta;
  candidate: Candidate;
  career_summary: CareerSummary;
  technical_skills: TechnicalSkills;
  education: Education;
  employment: EmploymentEntry[];
}

// ── Review UI helpers ─────────────────────────────────────────────────────────

export const REVIEW_CONFIDENCE_THRESHOLD = 0.85;

export function needsReview(confidence: number): boolean {
  return confidence < REVIEW_CONFIDENCE_THRESHOLD;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

// ── API resource wrappers (mirror docs/api-reference.md) ────────────────────

export type ExtractionStatus = "ready_for_review" | "approved" | "failed";
export type GenerationStatus = "pending" | "rendering" | "complete" | "failed";
export type JobStatus =
  | "queued"
  | "parsing"
  | "extracting"
  | "processing"
  | "retrying"
  | "success"
  | "parsed"
  | "ready_for_review"
  | "complete"
  | "failed"
  | "cancelled";

export interface UserResponse {
  id: string;
  org_id: string;
  email: string;
  role: "admin" | "recruiter";
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface CandidateResponse {
  id: string;
  org_id: string;
  name: string;
  master_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateListResponse {
  items: CandidateResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProfileResponse {
  profile_id: string;
  candidate_id: string;
  extraction_status: ExtractionStatus;
  overall_confidence: number | null;
  extraction_model: string;
  approved_at: string | null;
  profile: CandidateProfile;
}

export interface ReviewEventResponse {
  id: string;
  field_path: string;
  action: "confirm" | "edit" | "remove";
  old_value: unknown;
  new_value: unknown;
  user_id: string;
  created_at: string;
}

export interface DocumentUploadResponse {
  document_id: string;
  candidate_id: string;
  job_id: string;
  status: "queued";
  message: string;
}

export interface DocumentResponse {
  id: string;
  org_id: string;
  candidate_id: string;
  type: "original" | "generated";
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  parse_status: string;
  extraction_instructions: string | null;
  created_at: string;
}

export interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  entity_type?: "document" | "profile" | "generation" | string;
  entity_id?: string;
  error_message: string | null;
  meta?: unknown;
}

export interface GenerationResponse {
  id: string;
  candidate_id: string;
  template_id: string;
  profile_id: string;
  status: GenerationStatus;
  formatting_instructions: string | null;
  output_document_url: string | null;  // DOCX download URL
  output_pdf_url: string | null;        // PDF download URL
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationListResponse {
  items: GenerationResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface TemplateResponse {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  config_json: { sections?: string[]; required_fields?: string[]; [k: string]: unknown };
  template_type: "docx" | "latex";  // "docx" | "latex"
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgBranding {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font: string | null;
}

export interface OrgResponse {
  id: string;
  name: string;
  plan_tier: string;
  branding_config: OrgBranding;
  created_at: string;
}

export interface UsageSummaryResponse {
  org_id: string;
  period: "all_time" | "this_month";
  total_cvs_uploaded: number;
  total_cvs_generated: number;
  total_api_calls: number;
}

export interface ApiErrorDetail {
  message: string;
  unreviewed_paths?: string[];
  tip?: string;
}