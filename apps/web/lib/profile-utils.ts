/**
 * Small dependency-free helpers for reading/writing the CandidateProfile
 * by dot-notation field_path (matching the API's PATCH contract exactly —
 * see docs/api-reference.md §8, "field_path format").
 */
import type { CandidateProfile } from "./types";
import { needsReview } from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function pathParts(path: string): (string | number)[] {
  return path.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

export function getByPath(obj: unknown, path: string): unknown {
  return pathParts(path).reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string | number, unknown>)[key];
  }, obj);
}

/** Returns a new profile with `value` set at `path`. Original is untouched. */
export function setByPath(profile: CandidateProfile, path: string, value: unknown): CandidateProfile {
  const next = clone(profile);
  const parts = pathParts(path);
  let cursor: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]] as Record<string | number, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

/** Returns a new profile with the array item at `path` removed (path must point at an array element). */
export function removeAtPath(profile: CandidateProfile, path: string): CandidateProfile {
  const next = clone(profile);
  const parts = pathParts(path);
  const last = parts[parts.length - 1];
  let cursor: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]] as Record<string | number, unknown>;
  }
  const arr = cursor as unknown as unknown[];
  if (Array.isArray(arr) && typeof last === "number") {
    arr.splice(last, 1);
  }
  return next;
}

export interface FlaggedField {
  path: string;
  confidence: number;
  kind: "bullet" | "skill_group" | "education_item" | "responsibility";
}

/** Every provenance-bearing field in the profile that needs recruiter review, in reading order. */
export function collectFlaggedFields(profile: CandidateProfile): FlaggedField[] {
  const flagged: FlaggedField[] = [];

  profile.career_summary.bullets.forEach((b, i) => {
    if (needsReview(b.confidence)) {
      flagged.push({ path: `career_summary.bullets.${i}.text`, confidence: b.confidence, kind: "bullet" });
    }
  });

  profile.technical_skills.groups.forEach((g, i) => {
    if (needsReview(g.confidence)) {
      flagged.push({ path: `technical_skills.groups.${i}`, confidence: g.confidence, kind: "skill_group" });
    }
  });

  profile.education.items.forEach((it, i) => {
    if (needsReview(it.confidence)) {
      flagged.push({ path: `education.items.${i}.text`, confidence: it.confidence, kind: "education_item" });
    }
  });

  profile.employment.forEach((job, ji) => {
    job.responsibilities.forEach((r, ri) => {
      if (needsReview(r.confidence)) {
        flagged.push({
          path: `employment.${ji}.responsibilities.${ri}.text`,
          confidence: r.confidence,
          kind: "responsibility",
        });
      }
    });
  });

  return flagged;
}