/**
 * Upload page — Epic 4.1
 *
 * Features to implement:
 *   - Drag-and-drop file upload (PDF / DOCX)
 *   - Upload progress indicator
 *   - Extraction-time custom instructions text box (PRD §9.6)
 *   - On success: redirect to /candidates/[id]/review
 *
 * API calls:
 *   - POST /v1/documents  → uploadDocument()
 *   - GET  /v1/jobs/{id}  → getJobStatus() (poll until parsed)
 */
export default function UploadPage() {
  return (
    <main>
      <h1>Upload CV</h1>
      {/* TODO (Epic 4.1): implement upload UI */}
      <p>Upload page — Epic 4.1</p>
    </main>
  );
}
