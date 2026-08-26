/**
 * Generation result page — Epic 6.2
 *
 * Features to implement:
 *   - Poll GET /v1/generations/{id} until status === "complete"
 *   - Show download button for the generated .docx
 *   - Link back to the source candidate profile
 *   - Show generation metadata (template used, generation timestamp)
 */
export default function GenerationPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main>
      <h1>Generation Result</h1>
      {/* TODO (Epic 6.2): implement generation result + download UI */}
      <p>Generation result page — Epic 6.2 — generation ID: {params.id}</p>
    </main>
  );
}
