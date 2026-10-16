// AdiRecommendationPublicationStatus.jsx
// ---------------------------------------------------------------------------
// THE SECONDARY RECOMMENDATION PUBLICATION — DEVELOPER DIAGNOSTICS ONLY.
//
// Saving the validated plan is what makes an optimiser run terminal for the
// designer. The recommendation publication that follows it is BACKGROUND WORK:
// the run is already finished and its result is already readable from the saved
// plan, so what happened to that publication can never decide the terminal card,
// the bass authority or report readiness.
//
// This block is the one place it is stated — the status, the error verbatim,
// the write attempts and the fingerprints it wrote — and it is drawn only behind
// the internal debug gate, so it can be diagnosed without ever reaching a dealer.
//
// PRESENTATION ONLY: no calculation, no decision, no store, no retry of its own.
// ---------------------------------------------------------------------------

const STATUS_LABEL = Object.freeze({
  published: "Published",
  refused: "Refused — the saved plan stands",
  not_attempted: "Not attempted",
});

export default function AdiRecommendationPublicationStatus({ publication = null }) {
  if (!publication || typeof publication !== "object") return null;

  const status = STATUS_LABEL[publication.status] || publication.status || "Unknown";
  const attempts = Number.isFinite(Number(publication.attempts)) ? Number(publication.attempts) : null;
  const fingerprints = Array.isArray(publication.fingerprints)
    ? publication.fingerprints.filter(Boolean)
    : [];

  return (
    <div className="space-y-0.5" data-adi-recommendation-publication="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Recommendation publication (secondary)
      </div>
      <div
        className="flex items-baseline justify-between gap-3 text-[11px] text-[#3E4349]"
        data-adi-recommendation-publication-status={publication.status}
      >
        <span>Status</span>
        <span className="font-medium">{status}</span>
      </div>
      {attempts != null && (
        <div className="flex items-baseline justify-between gap-3 text-[11px] text-[#3E4349]">
          <span>Write attempts</span>
          <span className="font-medium tabular-nums">{attempts}</span>
        </div>
      )}
      {publication.error && (
        <div
          className="text-[11px] text-[#8A5A2B]"
          data-adi-recommendation-publication-failed="true"
        >
          Recommendation publication failed: {publication.error}
        </div>
      )}
      {fingerprints.length > 0 && (
        <div className="text-[10px] leading-relaxed text-[#8A7B6A]">
          Written against: {fingerprints.join(" · ")}
        </div>
      )}
      <div className="text-[10px] leading-relaxed text-[#8A7B6A]">
        The run was already terminal before this publication started. Its outcome never changes the
        saved optimiser plan, the current bass result or report readiness.
      </div>
    </div>
  );
}