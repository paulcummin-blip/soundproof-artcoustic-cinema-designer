// AdiEngineerEvidenceBlock.jsx
// ---------------------------------------------------------------------------
// ENGINEER DETAILS — the limits and the fingerprints behind the panel.
//
// The limiting frequency and the limiting seat are the two values every other
// number on the card depends on, and the fingerprints identify exactly which
// design, which published bass result and which applied calibration the panel is
// describing. All of it is evidence, so all of it lives in the collapsed
// disclosure and none of it in the designer's default view.
//
// Presentation only: every value is passed in already resolved. A value that is
// not available is omitted rather than guessed.
// ---------------------------------------------------------------------------

import React from "react";
import { resolveLimitingFrequency } from "./optimiserLimitingFrequency.js";

function Row({ label, value, mono = false }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-relaxed">
      <span className="text-[#625143]">{label}:</span>
      <span
        className={`text-[#1B1A1A] ${mono ? "font-mono text-[10px] break-all" : "font-semibold"}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function AdiEngineerEvidenceBlock({
  limitingFrequencyHz = null,
  limitingSeatId = null,
  designFingerprint = null,
  resultFingerprint = null,
  parityStatus = null,
  appliedCalibration = null,
  className = "",
}) {
  // The limiting frequency is stated through its own authority. A value that is
  // not a credible frequency — 0 Hz above all — is shown as NOT IDENTIFIED rather
  // than as a frequency the design does not have. A result that supplied NO value
  // at all contributes nothing, exactly as before.
  const frequency = limitingFrequencyHz == null || limitingFrequencyHz === ""
    ? null
    : resolveLimitingFrequency(limitingFrequencyHz).text;
  const calibrationStatus = appliedCalibration?.status || null;
  const calibrationFingerprint = appliedCalibration?.fingerprint || null;

  const hasAnything = Boolean(
    frequency
    || limitingSeatId
    || designFingerprint
    || resultFingerprint
    || parityStatus
    || calibrationStatus
    || calibrationFingerprint,
  );
  if (!hasAnything) return null;

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-engineer-evidence="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Limits and fingerprints
      </div>
      <Row label="Limiting frequency" value={frequency} />
      <Row label="Limiting seat" value={limitingSeatId} />
      <Row label="Baseline parity" value={parityStatus} />
      <Row label="Design fingerprint" value={designFingerprint} mono />
      <Row label="Bass result fingerprint" value={resultFingerprint} mono />
      <Row label="Applied calibration" value={calibrationStatus} />
      <Row label="Calibration fingerprint" value={calibrationFingerprint} mono />
    </div>
  );
}