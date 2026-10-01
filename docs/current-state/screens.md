# Current State Screens — User Interface & Route Breakdown

> **Scope**: This document audits all 9 user-facing screens in [`apps/web/app/`](file:///d:/Projects/Resume_Formatter/apps/web/app/). High-resolution screenshots captured during live browser auditing are linked from [`docs/audit/screenshots/`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/).

---

## 1. Route Map

```
/
├── /login                                    # Authentication (Google OAuth & retired password)
└── (dashboard)/                              # Authenticated shell (Sidebar + Topbar)
    ├── /dashboard                            # Executive recruiter analytics & pipeline feed
    ├── /upload                               # Multi-source intake (Dropzone & Text Form)
    ├── /candidates                           # Candidate directory & profile management
    ├── /candidates/[id]/review               # Side-by-side Review Studio & AI Copilot
    ├── /candidates/[id]/generate             # Template selector & CV generation trigger
    ├── /generations                          # Export history & document download center
    ├── /generations/[id]                     # Generation detail & progress status
    ├── /templates                            # Template gallery & docx uploader
    └── /settings                             # Workspace branding & usage analytics
```

---

## 2. Screen-by-Screen Deep Dive

### 1. Login Screen (`/login`)
- **File**: [`apps/web/app/(auth)/login/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(auth)/login/page.tsx)
- **Screenshot**: [`login_screen_1790891779070.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/login_screen_1790891779070.png)
- **Purpose**: Authenticate recruiters and establish session.
- **Data Shown**: Brand title ("CVMorph"), tagline, feature highlights ("Automated Intake", "Live Review Studio", "Branded Templates"), Google sign-in button.
- **Actions**:
  - Click "Continue with Google" → opens Firebase popup → calls `POST /v1/auth/google`.
  - Toggle email/password form (disabled with message directing to Google login).
- **Components Used**: `Button`, `Input`, `Card`, `Badge`.
- **States Handled**:
  - *Loading*: Button spinner during OAuth popup.
  - *Error*: Sonner toast displaying Firebase or backend error message.
- **Defects & Observations**:
  - Branded as "CVMorph" with purple gradient accents (`#8b7cf6`) instead of Copious teal/emerald (`#01AA83`).
  - Left banner uses hardcoded dark gradient rather than Copious brand graphics.

---

### 2. Executive Dashboard (`/dashboard`)
- **File**: [`apps/web/app/(dashboard)/dashboard/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/dashboard/page.tsx)
- **Screenshot**: [`dashboard_screen_1790891958227.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/dashboard_screen_1790891958227.png)
- **Purpose**: High-level command center showing recruitment velocity and CV transformation pipeline health.
- **Data Shown**:
  - Personalized greeting with recruiter's first name.
  - 4 composite KPI cards: Total Candidates, Total Profiles, Overall Approval Rate, Generated CVs.
  - Recent Candidate Ingestion table.
  - Recent Completed Generations table with instant DOCX and PDF download buttons.
- **Actions**: Quick upload button, direct links to Candidate Review and Generation downloads.
- **Components Used**: `Sidebar`, `Topbar`, `Card`, `Badge`, `Button`, `Skeleton`, `EmptyState`.
- **States Handled**:
  - *Loading*: Skeleton pulse animation on KPI cards and tables.
  - *Empty*: Displays `EmptyState` component when no candidates or exports exist.
  - *Error*: Error alert banner with retry button.

---

### 3. Candidate Directory (`/candidates`)
- **File**: [`apps/web/app/(dashboard)/candidates/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/candidates/page.tsx)
- **Screenshot**: [`candidates_screen_1790891980120.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/candidates_screen_1790891980120.png)
- **Purpose**: Browse, search, filter, and manage talent CV records.
- **Data Shown**: List of candidate cards showing candidate full name, target role title, profile count badge, master profile indicator, creation date, and status.
- **Actions**:
  - Real-time search filter by name or role title.
  - Profile branch selector modal (switch active profile, clone, tailor).
  - Quick action buttons: "Review Profile", "Generate CV", "Delete Candidate".
- **Components Used**: `Card`, `Badge`, `Button`, `Input`, `Dialog`, `EmptyState`.
- **States Handled**: Loading skeleton grid, empty search results state, deletion confirmation dialog.

---

### 4. CV Intake & Upload (`/upload`)
- **File**: [`apps/web/app/(dashboard)/upload/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/upload/page.tsx)
- **Screenshot**: [`upload_screen_1790891991932.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/upload_screen_1790891991932.png)
- **Purpose**: Upload candidate CV documents or paste raw text profiles.
- **Data Shown**:
  - Dual intake tabs: "Upload Document (PDF / DOCX)" and "Paste Direct Text".
  - Stage Stepper: "Upload" → "Parsing" → "AI Extraction" → "Review Ready".
  - Strategic Alignment controls: Target Role input, Job Description textarea, and 4-tier Alignment Level slider (`Strict Facts`, `Role Focus`, `Role Alignment`, `Scope Expansion`).
- **Actions**: Drag-and-drop file upload, text submit, alignment tuning.
- **Components Used**: `Dropzone`, `StageStepper`, `Button`, `Input`, `Card`.
- **States Handled**: Drag active state, upload progress, polling spinner with status updates.

---

### 5. Candidate Review Studio (`/candidates/[id]/review`)
- **File**: [`apps/web/app/(dashboard)/candidates/[id]/review/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/candidates/[id]/review/page.tsx)
- **Screenshot**: [`review_studio_screen_1790892008131.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/review_studio_screen_1790892008131.png)
- **Purpose**: The core workspace where TA recruiters review, verify, edit, hide, or enhance CV data before final export.
- **Data Shown**:
  - Top header: Candidate name, profile selector dropdown, approval status badge, "Approve Profile" and "Generate CV" buttons.
  - Left/Center panel: Categorized sections (Candidate Basics, Career Summary, Technical Competencies, Work Experience, Education).
  - Field-level confidence badges (High: Green, Medium: Yellow, Low: Red) with verbatim evidence popovers.
  - Source type indicators (`source`, `verified_transformation`, `tailored_enhancement`, `extrapolated_bluff`).
  - Right panel: Live toggleable PDF/DOCX preview and collapsible **AI Agent Copilot** drawer.
- **Actions**:
  - Inline editing of summary bullets, job responsibilities, skills, dates, and companies.
  - Add / remove bullets and skill groups.
  - Conversational AI Copilot chat: natural language commands like "Shorten summary to 3 bullets" or "Add TypeScript under Frontend".
  - "Approve Profile": Persists approval state and unlocks generation.
- **Components Used**: `AIAgentDrawer`, `ApproveBar`, `ConfidenceBadge`, `EmploymentEntryCard`, `EvidencePopover`, `PreviewPanel`, `ReviewableBullet`, `SkillGroupCard`, `Button`, `Input`.
- **States Handled**: Unsaved edits indicator, low-confidence warning counter, copilot streaming/typing state, approve error handling.

---

### 6. Generate CV Screen (`/candidates/[id]/generate`)
- **File**: [`apps/web/app/(dashboard)/candidates/[id]/generate/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/candidates/[id]/generate/page.tsx)
- **Screenshot**: [`generate_screen_1790892020169.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/generate_screen_1790892020169.png)
- **Purpose**: Select output template and configure final export instructions.
- **Data Shown**: Template selection cards (Classic Professional, Contemporary Header, Modern Sidebar), candidate summary pill, optional formatting instructions input.
- **Actions**: Template radio selection, instruction input, "Start Generation" button.
- **Components Used**: `Card`, `Button`, `Badge`, `Input`.
- **States Handled**: Unapproved profile warning blocker (redirects to Review Studio if profile is pending), generation in-progress polling modal.

---

### 7. Generations History & Downloads (`/generations`)
- **File**: [`apps/web/app/(dashboard)/generations/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/generations/page.tsx)
- **Screenshot**: [`generations_screen_1790892044210.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/generations_screen_1790892044210.png)
- **Purpose**: Centralized log of all formatted CV generations with download links.
- **Data Shown**: Table of generations with candidate name, target role, template used, completion timestamp, status badge (`complete`, `rendering`, `failed`), and download buttons for DOCX and PDF.
- **Actions**: Filter by candidate, instant DOCX download, inline PDF viewer trigger.
- **Components Used**: `Card`, `Badge`, `Button`, `Input`, `EmptyState`.

---

### 8. Template Gallery (`/templates`)
- **File**: [`apps/web/app/(dashboard)/templates/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/templates/page.tsx)
- **Screenshot**: [`templates_screen_1790892064285.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/templates_screen_1790892064285.png)
- **Purpose**: Browse official corporate templates and upload custom branded variations.
- **Data Shown**: Grid of templates with system badges ("Official Copious Template"), description, format type (`.docx`), section schema summary, and download button.
- **Actions**: "Upload Template" modal (admin only), preview/download original template file.
- **Components Used**: `Card`, `Badge`, `Button`, `Dialog`, `Input`.

---

### 9. Workspace Settings (`/settings`)
- **File**: [`apps/web/app/(dashboard)/settings/page.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/app/(dashboard)/settings/page.tsx)
- **Screenshot**: [`settings_screen_1790892103526.png`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/settings_screen_1790892103526.png)
- **Purpose**: Manage organization details, export file naming conventions, branding colors, and usage counters.
- **Data Shown**: Organization name, current plan tier, export file naming pattern template (`CVMorph - {Name} - {Role}`), usage metrics (CVs uploaded, CVs rendered).
- **Actions**: Edit organization name, customize naming pattern, save branding preferences.
- **Components Used**: `Card`, `Input`, `Button`, `Badge`.

---

## 3. UI/UX Consistency & Design System Gaps

1. **Brand Identity Dissonance**:
   - Every screen uses `#8b7cf6` (purple) as primary accent color. Copious's official brand color is `#01AA83` (emerald green) and `#48D7AC` (mint).
2. **Duplicated Component Logic**:
   - `apps/web/components/ui/` contains primitive components (`Button`, `Card`, `Badge`), but complex cards in `Review Studio` re-implement ad-hoc border and color styles rather than using standard design tokens.
3. **Hardcoded String Literals**:
   - The string `"CVMorph"` appears in 18 UI files across titles, footers, meta descriptions, and default naming patterns.
