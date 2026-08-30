/**
 * Renders text containing `**bold**` markdown spans as real <strong> tags.
 * This is the client-side mirror of the backend's `richtext` docxtpl filter
 * (see docs/cv_schema_template_mapping.md §4) — same convention, so what a
 * recruiter sees bolded in the review UI is exactly what will be bolded in
 * the generated document.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
  return (
    <span className={className ? `richtext ${className}` : "richtext"}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}