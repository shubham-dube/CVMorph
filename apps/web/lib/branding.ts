/**
 * Branding configuration — single source of truth for product name and visual identity.
 *
 * PRD rule: NEVER hardcode the product name in UI component text.
 * Always import BRAND.name from here so renaming is a one-file change.
 */

export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "CV Platform",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "AI-powered CV transformation",
  colors: {
    primary: "#1A1A2E",
    accent: "#E94560",
    background: "#0F0F23",
    surface: "#16213E",
    text: "#EAEAEA",
    muted: "#8892B0",
  },
} as const;
