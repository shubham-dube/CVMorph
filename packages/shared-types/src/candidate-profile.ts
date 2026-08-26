/**
 * Canonical Candidate Profile — TypeScript types
 *
 * Mirror of apps/api/app/schemas/candidate_profile.py
 * SOURCE OF TRUTH: the Python Pydantic schema. Update there first, then sync here.
 *
 * Used by:
 *   - apps/web — review UI, type-safe API client
 *   - Future: public TypeScript SDK
 *
 * Epic 3.1 / 4 — these types unlock the frontend team to start building
 * the review UI (Epic 4) against mocked API responses as soon as the schema
 * is finalized, without waiting for the backend to be complete.
 */

// ── Provenance / trust primitives ─────────────────────────────────────────────

export type SourceType =
  | "source"
  | "verified_transformation"
  | "ai_generated";

export interface Provenance {
  confidence: number; // [0, 1]
  source_type: SourceType;
  evidence: string | null;
}

// ── Section models ─────────────────────────────────────────────────────────────

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
  /** Cover page / header positioning title. May differ from most recent job title. */
  role_title: string;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface SummaryBullet extends Provenance {
  /** May contain **bold** markdown spans — render with a RichText component. */
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
  /** Full human-readable line. May contain **bold** spans. */
  text: string;
}

export interface Education {
  /** True if any item has type === 'certification'. Drives section heading. */
  has_certifications: boolean;
  items: EducationItem[];
}

export interface ResponsibilityBullet extends Provenance {
  /** May contain **bold** markdown spans. */
  text: string;
}

export interface EmploymentEntry {
  company: string;
  /** Always present in JSON — null when not applicable. */
  client: string | null;
  role: string;
  start_date: string | null; // YYYY-MM
  end_date: string | null;   // YYYY-MM
  is_current: boolean;
  /** Verbatim display string e.g. "May/2022 - Present". Template prints this as-is. */
  duration_display: string;
  /** Always present in JSON — null when not applicable. */
  project_name: string | null;
  /** Always present in JSON — empty array when absent. */
  technology_used: string[];
  /** Always present in JSON — null when not applicable. May contain **bold** spans. */
  project_description: string | null;
  responsibilities: ResponsibilityBullet[];
  /** Roll-up: lowest confidence among this entry's fields. */
  confidence: number;
}

// ── Root type ─────────────────────────────────────────────────────────────────

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

/** Returns true if a field needs recruiter review. */
export function needsReview(confidence: number): boolean {
  return confidence < REVIEW_CONFIDENCE_THRESHOLD;
}

/** Confidence level label for UI badges. */
export type ConfidenceLevel = "high" | "medium" | "low";

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

// ── API response wrappers ─────────────────────────────────────────────────────

export interface DocumentUploadResponse {
  document_id: string;
  job_id: string;
  status: "queued";
}

export interface JobStatusResponse {
  job_id: string;
  status: string;
  entity_type: "document" | "profile" | "generation";
  entity_id: string;
  error_message: string | null;
}

export interface GenerationResponse {
  id: string;
  status: "pending" | "rendering" | "complete" | "failed";
  output_document_url: string | null;
}
