// AdiCombinedCalibrationEvidence.jsx
// ---------------------------------------------------------------------------
// ENGINEER DETAILS — the combined calibration result, and every calibration
// result the run confirmed with the decision taken on it.
//
// The per-lever lines beside this block state what each isolated search produced
// (delay, gain, polarity, phase). This block states the one thing those lines
// cannot: whether a COMBINED result was confirmed, which levers it retuned, what
// it did to P19 and P20, and — for every confirmed result — whether it was
// applied, held or rejected, with the reason the run recorded.
//
// Presentation only. Every value is read from the saved evidence; the candidate
// ids, counts and reasons belong here and nowhere else on the panel.
// ---------------------------------------------------------------------------

import React from "react";
import {
  CALIBRATION_EVIDENCE_STATUS,
  combinedCalibrationEvidence,
  describeCombinedCalibration,
} from "./optimiserCalibrationEvidence.js";
import {
  formatCalibrationComposition,
  calibrationValuePairText,
} from "./bestCalibrationResult.js";
import { EVIDENCE_SCOPE, isWinningCandidate, scopeCandidateEvidence } from "./optimiserResultIdentity.js";

/** The one title the combined block carries while it IS the current result. */
export const COMBINED_CALIBRATION_TITLE = "Combined calibration";

/**
 * The one label a combined result that is NOT the terminal winner — or that
 * belongs to an earlier run — is stated with. It is a tested alternative, never
 * a second current winner.
 */
export const ALTERNATIVE_TESTED_LABEL = "Alternative tested";

/** "Applied" / "Held" / the run's own outcome word, as the decision recorded it. */
function outcomeWord(entry) {
  if (entry?.applied === true || entry?.outcome === "applied") return "Applied";
  if (entry?.outcome === "rejected") return "Rejected";
  return "Held";
}

function Line({ label, text, scope }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-relaxed">
      <span className="text-[#625143]">{label}:</span>
      <span className="text-[#1B1A1A]">{text}</span>
      {scope && <span className="text-[#8A7B6A]">{scope}</span>}
    </div>
  );
}

export default function AdiCombinedCalibrationEvidence({
  evidence = null,
  // THE ONE CURRENT WINNER, and the identity of the active terminal result. A
  // combined result that belongs to a different run — or describes a different
  // candidate from that winner — is never shown as a parallel current-result
  // section: it is stated as an alternative that was tested.
  winnerId = null,
  activeIdentity = null,
  className = "",
}) {
  const combined = combinedCalibrationEvidence(evidence);
  const decisions = Array.isArray(evidence?.candidateDecisions) ? evidence.candidateDecisions : [];
  if (!combined && decisions.length === 0) return null;

  const retained = combined?.evidenceStatus === CALIBRATION_EVIDENCE_STATUS.RETAINED;
  const combinedScope = scopeCandidateEvidence({ evidence: combined, active: activeIdentity, winnerId });
  const combinedIsWinner = combinedScope.scope === EVIDENCE_SCOPE.CURRENT
    && combinedScope.isWinner !== false;
  const composition = combined ? formatCalibrationComposition(
    [
      combined.bestCandidate?.phaseRetuned === true ? "phase" : null,
      combined.bestCandidate?.delayRetuned === true ? "delay" : null,
      combined.bestCandidate?.gainRetuned === true ? "gain" : null,
    ].filter(Boolean),
  ) : null;

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-combined-calibration-evidence="true">
      {retained ? (
        <>
          <div
            className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]"
            {...(combinedIsWinner
              ? { "data-adi-combined-calibration-title": "true" }
              : { "data-adi-alternative-tested": "true" })}
          >
            {combinedIsWinner ? COMBINED_CALIBRATION_TITLE : ALTERNATIVE_TESTED_LABEL}
          </div>
          <Line
            label={composition || combined.label || COMBINED_CALIBRATION_TITLE}
            text={[
              describeCombinedCalibration(combined) || null,
              combined.bestCandidate?.candidateId || "candidate id not recorded",
            ].filter(Boolean).join(" · ")}
          />
        </>
      ) : null}

      {decisions.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Every confirmed calibration result, and the decision taken on it
          </div>
          {decisions.map((entry, index) => {
            const record = entry?.decisionRecord || null;
            const values = calibrationValuePairText(record?.before, record?.after);
            const key = `${entry?.lever || "result"}:${entry?.candidateId || index}`;
            // ONE CURRENT WINNER: a confirmed result that is not the terminal
            // winner keeps its evidence but is named an alternative that was
            // tested — it is never left to read as a second current result.
            const entryWinner = isWinningCandidate({ candidateId: entry?.candidateId, winnerId });
            return (
              <div key={key} className="text-[11px] leading-relaxed" data-adi-calibration-candidate-decision={outcomeWord(entry)}>
                <span className="text-[#1B1A1A]">{entry?.candidateId || "candidate id not recorded"}</span>
                <span className="text-[#8A7B6A]"> · {entry?.lever || "result"} · {outcomeWord(entry)}</span>
                {entryWinner === false ? (
                  <span className="text-[#8A7B6A]"> · {ALTERNATIVE_TESTED_LABEL}</span>
                ) : null}
                {values ? <span className="text-[#3E4349]"> · {values}</span> : null}
                {entry?.reason ? <span className="text-[#8A7B6A]"> · {entry.reason}</span> : null}
                {entry?.statement ? <span className="text-[#625143]"> · {entry.statement}</span> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}