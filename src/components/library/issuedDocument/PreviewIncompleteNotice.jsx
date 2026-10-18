/**
 * PreviewIncompleteNotice
 * -----------------------
 * The body of the degraded-success notice: the exported PDF IS stored, and its
 * page preview is what is missing.
 *
 * It is worded so a designer never reads it as a failed document — the document
 * is safe, it opens and downloads from the Project Library as it is, and a
 * preview that keeps failing is something support can look at. Presentation only:
 * every sentence here is a statement about a document that was stored.
 */

export default function PreviewIncompleteNotice({ label, summary }) {
  return (
    <div className="grid gap-1">
      {label && <span className="font-medium">{label}</span>}
      {summary && <span>{summary}</span>}
      <span>You can still open and download the PDF from Project Library.</span>
      <span>If this continues, contact Sound Proof support.</span>
    </div>
  );
}