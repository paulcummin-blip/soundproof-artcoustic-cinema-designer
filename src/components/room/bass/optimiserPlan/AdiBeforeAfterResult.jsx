// AdiBeforeAfterResult.jsx
// ---------------------------------------------------------------------------
// The ONE presentation for an ADI recommendation's before → after performance.
//
// It answers, in this order and at a glance:
//   • what the metric was before
//   • what it is predicted to be afterwards — the most prominent figure,
//     because that is the result the designer is deciding on
//   • how big the improvement is, stated separately from that final value
//   • the RP22 level before and after, so a real gain that does not change the
//     published level is never mistaken for one that does
//
// Presentation only: every value arrives already formatted from the summary
// authority (whole dB, no decimals). Nothing here is calculated, graded,
// scored or re-evaluated.
// ---------------------------------------------------------------------------

import React from "react";

export default function AdiBeforeAfterResult({
  metricLabel = "P20",
  beforeText = null,
  afterText = null,
  improvementDb = null,
  levelLabel = "RP22 Level",
  levelBefore = null,
  levelAfter = null,
  className = "",
}) {
  const finalText = afterText || beforeText;
  const showsBefore = Boolean(beforeText) && Boolean(afterText) && beforeText !== afterText;
  const showsLevel = Boolean(levelBefore || levelAfter);
  if (!finalText && !showsLevel) return null;

  const improvement = Number(improvementDb);
  const improvementText = Number.isFinite(improvement) && improvement >= 1
    ? `${Math.round(improvement)} dB improvement`
    : null;

  return (
    <div className={`space-y-0.5 ${className}`}>
      {finalText && (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[11px] font-semibold text-[#1B1A1A]">{metricLabel}:</span>
          {showsBefore && (
            <span className="text-[11px] text-[#8A7B6A]">{beforeText} →</span>
          )}
          {/* The predicted final result — the figure the decision rests on. */}
          <span className="text-[15px] font-bold leading-none text-[#1B1A1A]">{finalText}</span>
          {improvementText && (
            <span className="text-[11px] font-medium text-[#213428]">({improvementText})</span>
          )}
        </div>
      )}
      {showsLevel && (
        <div className="text-[11px] text-[#3E4349]">
          {levelLabel}:{" "}
          <span className="font-semibold text-[#1B1A1A]">
            {levelBefore || "—"} → {levelAfter || "—"}
          </span>
        </div>
      )}
    </div>
  );
}