# Frontend UX & Design System Plan

Written before implementation, per the request — this is the plan the build follows, not a retrospective description.

---

## 1. Who's using this and what they need to feel

The primary user is a recruiter formatting 5–30 CVs a week under time pressure, being asked to trust an AI they didn't build. Two things have to be true simultaneously for this product to actually get adopted instead of quietly abandoned for the old copy-paste workflow:

1. **It has to be fast** — faster than manual formatting, every single time, with no dead ends.
2. **It has to be trustworthy** — a recruiter who sends a client an AI-mangled CV with a wrong job title looks bad in front of their own client. The UI's job is to make it obvious, at a glance, what's safe to trust and what needs a human look.

Every UX decision below is in service of one of those two things. Where they conflict (trust usually wants more friction, speed wants less), trust wins for anything that could ship a factual error, and speed wins for everything else.

---

## 2. Information architecture

```
/login                              — auth
/                                   — redirects to /candidates (or /login if signed out)
/candidates                         — list/search, primary landing surface after login
/upload                             — new CV intake
/candidates/[id]/review             — the flagship screen: confidence-driven review + approve
/candidates/[id]/generate           — template + instructions, triggers generation (reachable only after approval)
/generations                        — history of everything generated, searchable
/generations/[id]                   — single generation status + download
/templates                          — template library (admin can manage; recruiters can browse)
/settings                           — org branding, usage (admin-gated sections)
```

**Why `/candidates` and not `/dashboard` as the landing page:** a recruiter's mental model is "which candidates am I working on," not "here is a dashboard of charts." Usage stats live in `/settings`, not front and center — this is a working tool, not a BI product, at least not yet.

**Why generation is a separate step/route from review, not a modal on the review page:** approval and generation are genuinely different decisions (`is this data right` vs. `which template / what emphasis for this specific submission`) and a candidate's approved profile can be generated into multiple client CVs over time — giving it its own address makes that reusable relationship visible instead of hidden inside a modal that's gone the moment you close it.

---

## 3. The core UX pattern: confidence-first review

This is the single most important interaction in the product, so it gets designed first and everything else supports it.

**Default state:** fields at or above 85% confidence render as calm, settled text — no chrome, no badges, nothing demanding attention. Fields below 85% render with a visible amber/red left accent and a confidence pill. This means a recruiter's eye is drawn *only* to what needs them — a well-extracted CV should feel almost like reading a finished document, not filling out a form.

**Per-field interaction (applies to every bullet, skill group, education line, employment entry):**
- Hover reveals a subtle affordance row: `Show source` · `Edit` · `Confirm` · `Remove`.
- `Show source` opens a popover with the verbatim evidence sentence from the original CV — this is the trust primitive. For `ai_generated` content (e.g. the synthesized career-summary bullets) there is no evidence sentence, so this shows a distinct "AI-synthesized, no direct source" badge instead — never a fake or misleading "source" for something that doesn't have one.
- `Edit` turns the text into an inline textarea with a minimal formatting toolbar (Bold only — matches the `**bold**` markdown convention the schema/template actually uses, nothing more, so there's never a mismatch between what the UI lets you format and what the template can render).
- `Confirm` marks a low-confidence field as reviewed without changing it — this is the fast path for "the AI got it right, I just need to formally sign off," which will be the majority case once extraction quality is decent.
- `Remove` deletes the bullet/entry entirely (used when the AI included something that shouldn't be on this CV at all).

**Progress, not a wall of red:** a slim sticky progress indicator ("4 of 7 fields reviewed") sits at the top of the page at all times, so a recruiter always knows how much is left without scrolling to check. The `Approve & Generate` button is disabled with a tooltip explaining exactly what's blocking it, and clicking it while blocked scrolls to and highlights the next unreviewed field rather than just refusing silently — mirrors the backend's own `422` gate response (`unreviewed_paths`), so the UI's blocking behavior and the API's enforcement are never out of sync.

**"Expand all":** a single toggle reveals every high-confidence field's affordances too, for the (rarer) case a recruiter wants to double-check something the system was confident about. Collapsed by default because reviewing everything defeats the purpose of confidence scoring in the first place.

---

## 4. Flow-by-flow UX

### 4.1 Upload
Single, calm drop zone — drag-and-drop or click-to-browse, PDF/DOCX only, 10MB limit surfaced before it's hit (not just as an error after). A collapsed "Add instructions for this CV" affordance beneath it, expanding into the extraction-instructions textarea — collapsed by default so it doesn't imply every upload needs special handling, but one click away for the recruiter who has something specific to say ("use the most recent title, not the CV header").

On submit: the drop zone transforms in place into a **stepper** (`Uploading → Parsing → Extracting → Ready for review`), each step's status driven by polling `GET /v1/jobs/{job_id}`. No spinner-and-hope — each stage is named so a slow step reads as "still working" rather than "is this broken." On completion, auto-navigate to the review screen — no extra click required, since the recruiter's very next action is always going to be reviewing.

### 4.2 Candidates list
A searchable, sortable table — name, current review/approval status (`Needs review` / `Approved` / `Generated`), last updated, quick actions. This is the "where did I leave off" screen — a recruiter mid-week with 12 candidates in flight needs to find the one they were working on, not re-upload.

### 4.3 Review → Approve → Generate
Review page as described in §3. Once every low-confidence field is reviewed, `Approve & Generate` becomes active — approving calls the approve endpoint, then routes straight into the generation step (template picker + optional formatting instructions) rather than dead-ending on a static "approved" state, because approval's entire purpose is to unlock generation.

### 4.4 Generation result
A polling status screen with the same named-stages pattern as upload (`Pending → Rendering → Complete`). On completion: a clear download button, the template used, and a link back to the candidate. On failure: the actual error message, not a generic "something went wrong," plus a retry action that re-submits the same generation request.

### 4.5 Templates
A card grid (name, description, which sections it uses) rather than a bare list — this is a browsing/picking surface, not a data table, and cards read faster at a glance for something a recruiter selects once per generation. Admins get an "Upload template" action; recruiters see the same grid read-only.

### 4.6 Settings
Org branding (logo, colors, font — feeds the white-labeling groundwork from the PRD) and usage stats, admin-gated. Deliberately last in the nav — this is configuration, visited rarely, not a daily surface.

---

## 5. Visual design system

### 5.1 Direction
**Modern, calm, dark-first "control room" aesthetic** — deep near-black surfaces with a single confident accent color, generous whitespace, and restrained motion. The reference point is the current generation of well-designed developer/ops tools (Linear, Vercel, Raycast) rather than a generic admin-dashboard template — those products earn trust visually through restraint, not decoration, which is exactly the emotional register this product needs given §1. Light mode is a fully supported, equally polished second theme, not an afterthought — many recruiters work in bright offices — with the theme persisted and switchable from the topbar.

### 5.2 Color system
A neutral near-black/near-white scale for structure, a single indigo-violet accent for interactive elements and brand identity, and a **fixed, non-themed semantic triad for confidence** (green/amber/red) that stays constant across light and dark mode — confidence meaning must never shift with a cosmetic setting.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#08090D` | `#FAFAFB` | App background |
| `--surface` | `#111319` | `#FFFFFF` | Cards, panels |
| `--surface-raised` | `#191C24` | `#FFFFFF` (+shadow) | Popovers, modals |
| `--border` | `#23262F` | `#E5E7EB` | Hairlines |
| `--text` | `#F3F4F6` | `#111319` | Primary text |
| `--text-muted` | `#9AA0AE` | `#6B7280` | Secondary text |
| `--accent` | `#8B7CF6` | `#6D5BD0` | Primary actions, links, focus rings |
| `--accent-strong` | `#A594FF` | `#5B47C7` | Hover/active accent |
| `--confidence-high` | `#34D399` | same | ≥85% |
| `--confidence-medium` | `#FBBF24` | same | 60–84% |
| `--confidence-low` | `#F87171` | same | <60% |

All defined as CSS custom properties under `[data-theme="dark"]` / `[data-theme="light"]`, consumed via Tailwind v4's `@theme inline` mapping — this is what makes "consistent, easy to retheme" actually true: change the token file, not components.

### 5.3 Typography
**Inter** (via `next/font`) for UI text — excellent legibility at small sizes, which matters given how text-dense the review screen is. A monospace face (`JetBrains Mono`) reserved strictly for confidence percentages and technical metadata, giving them a deliberate "data" feel distinct from prose. Type scale kept small and restrained (13/14/16/20/28px) — this is a document-review tool, not a marketing page; the CV content itself should read like a document, not like oversized dashboard copy.

### 5.4 Elevation & motion
Flat surfaces with 1px borders as the primary separator (dark-mode shadows read muddy — border-based separation is the more reliable pattern here); a soft shadow reserved only for genuinely floating elements (popovers, modals, toasts). Motion is short and purposeful — 120–180ms ease-out for hover/expand states, no bouncing, no decorative animation — the product's whole pitch is competence and trust, and showy motion undercuts that.

### 5.5 Component inventory (built once, reused everywhere)
`Button` (primary/secondary/ghost/destructive, with loading state) · `Card` · `Badge` (generic + the dedicated `ConfidenceBadge`) · `Input` / `Textarea` (with the bold-markdown mini-toolbar variant) · `Popover` (powers `EvidencePopover`) · `Dialog` · `Toast` · `Progress` (linear, for upload/generation stepper) · `Skeleton` (loading states everywhere — no layout-shifting spinners) · `EmptyState` · `Avatar` · `DropdownMenu` (user menu, theme toggle) · `Tooltip`.

Built as small, composable primitives (in the spirit of shadcn/ui) rather than pulled from a heavy pre-styled component library — this keeps the bundle lean and every visual detail under direct control, which matters for a product whose whole differentiator is that it doesn't look like a generic internal tool.

### 5.6 Accessibility & states
Every interactive element has a visible focus ring (`--accent`, 2px, offset) — keyboard nav matters for a tool used all day. Every data-fetching surface has three explicit states designed up front, not bolted on: **loading** (skeletons matching final layout, not spinners), **empty** (a real illustration/message + a next action, never a bare "no data"), **error** (the actual message, plus retry). Color is never the only signal on confidence — the badge always carries a text label (`High`/`Medium`/`Low`) alongside the color, for color-blind users and for anyone glancing at a screenshot.

---

## 6. What this plan deliberately leaves out of the first build

- No dark/light auto-detection edge cases beyond `prefers-color-scheme` as the default before a manual choice is persisted — good enough, not worth more engineering yet.
- No drag-to-reorder on employment entries/bullets — reordering isn't in the API (`field_path` addresses positions, not arbitrary reordering) and speculatively building it client-side would create a UI/API mismatch.
- No offline/optimistic-write conflict resolution — the backend's `409` on an already-approved profile is surfaced as a clear error state, not silently retried or merged.

These are flagged, not forgotten — see `FRONTEND_BACKEND_GAPS.md` for what would need to change on the backend to support any of them properly.