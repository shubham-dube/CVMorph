/**
 * Candidate profile review page — Epic 4.2–4.6 (the core screen)
 *
 * Features to implement:
 *   - Fetch and render the full CandidateProfile
 *   - Confidence badge component on every reviewable field (Epic 4.3)
 *   - "Show source" evidence popover on each field (Epic 4.3)
 *   - Field-level confirm / edit / remove actions → PATCH /v1/candidates/{id}/profile (Epic 4.4)
 *   - Default: only low-confidence fields shown; "Expand all" toggle (Epic 4.5)
 *   - "Approve & Generate" button — disabled until all flagged fields addressed (Epic 4.6)
 *
 * See docs/cv_schema_template_mapping.md §3 for the exact data shape.
 * Import CandidateProfile type from @cv-platform/shared-types.
 */
export default function ReviewPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main>
      <h1>Review Profile</h1>
      {/* TODO (Epic 4.2): implement review UI for candidate {params.id} */}
      <p>Review page — Epic 4.2–4.6 — candidate ID: {params.id}</p>
    </main>
  );
}
