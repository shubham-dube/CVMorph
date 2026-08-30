
/**
 * Branding configuration — single source of truth for product name and
 * static (build-time) visual identity.
 *
 * PRD rule: NEVER hardcode the product name in UI component text.
 * Always import BRAND.name from here so renaming is a one-file change.
 *
 * Org-specific branding (logo/colors fetched from `GET /v1/orgs/me`) is
 * layered on top of this at runtime via OrgBrandingProvider — this file
 * only holds the product's own default identity, used before an org's
 * custom branding loads and as the fallback for orgs without one set.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "CVMorph",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "AI-formatted CVs, in your template, in minutes.",
} as const;