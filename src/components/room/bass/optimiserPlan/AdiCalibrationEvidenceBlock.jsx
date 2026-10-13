// AdiCalibrationEvidenceBlock.jsx
// ---------------------------------------------------------------------------
// ENGINEER DETAILS — the calibration evidence the saved run kept.
//
// One line per calibration lever (delay, gain, polarity, phase), stating what
// that search produced from the run's own record: whether it ran, how many
// candidates it generated, the best candidate it canonically confirmed with its
// P19/P20 before → after, and the run's own reason for not accepting it.
//
// When the saved record kept no calibration evidence, the block states that
// plainly — the panel never claims a lever was tested and found not useful
// without this evidence.
//
// Presentation only: every value arrives already resolved by
// optimiserCalibrationEvidence.js. Nothing is calculated here.
// ---------------------------------------------------------------------------

import React from "react";
import {
  CALIBRATION_EVIDENCE_LEVERS,
  CALIBRATION_EVIDENCE_STATUS,
  CALIBRATION_EVIDENCE_MISSING_DETAIL,
  calibrationEvidenceFor,
  describeCalibrationLever,
} from "./optimiserCalibrationEvidence.js";
import AdiCombinedCalibrationEvidence from "./AdiCombinedCalibrationEvidence.jsx";

function Row({ label, text, scope }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-relaxed" data-adi-calibration-evidence={label}>
      <span className="text-[#625143]">{label}:</span>
      <span className="text-[#1B1A1A]">{text}</span>
      {scope && <span className="text-[#8A7B6A]">{scope}</span>}
    </div>
  );
}

export default function AdiCalibrationEvidenceBlock({ evidence = null, className = "" }) {
  const rows = CALIBRATION_EVIDENCE_LEVERS
    .map((key) => calibrationEvidenceFor(evidence, key))
    .filter(Boolean)
    .filter((record) => record.evidenceStatus === CALIBRATION_EVIDENCE_STATUS.RETAINED)
    .map((record) => ({
      key: record.lever,
      label: record.label || record.lever,
      text: describeCalibrationLever(record),
      scope: record.tested === true ? null : record.scope,
      // The exact measurements behind a held calibration change, stated as its
      // own detail line beside the figure-free summary the panel shows.
      detail: record.notAppliedDetailReason || null,
    }))
    .filter((row) => Boolean(row.text));

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-calibration-evidence-block="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Calibration evidence
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-[#8A7B6A] leading-relaxed">{CALIBRATION_EVIDENCE_MISSING_DETAIL}</div>
      ) : (
        rows.flatMap((row) => [
          <Row key={row.key} label={row.label} text={row.text} scope={row.scope} />,
          // The exact measurement behind a held change: the panel states the rule,
          // Engineer details states the figures it was decided on.
          row.detail
            ? <Row key={`${row.key}-detail`} label="Held detail" text={row.detail} />
            : null,
        ].filter(Boolean))
      )}

      {/* The combined calibration result beside the isolated levers, with every
          confirmed calibration result and the decision taken on it. */}
      <AdiCombinedCalibrationEvidence evidence={evidence} className="pt-0.5" />
    </div>
  );
}