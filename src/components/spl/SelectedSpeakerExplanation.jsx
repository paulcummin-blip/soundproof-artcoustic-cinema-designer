// SelectedSpeakerExplanation.jsx
// ---------------------------------------------------------------------------
// The always-visible data-confidence explanation shown beside each selected
// competitor speaker on the RP22 Speaker Capability page.
//
// It describes, in plain installer language, how much of the RP22 result
// comes directly from published manufacturer specifications and how much
// Sound Proof has had to calculate or assume — derived entirely from the
// normalized record and capability authority for that selected speaker.
//
// It is presentation only: it reads the stored, normalized record and changes
// no value, threshold or grade. It does not duplicate the general FULL/GOOD/
// LIMITED guide that sits beneath the comparison.
//
// Wording follows the agreed reference style (James BE806 MKII):
//   - What useful specifications the manufacturer provides.
//   - What Sound Proof has calculated or assumed.
//   - What important manufacturer information remains unknown.
//
// The explanation logic lives in selectedSpeakerExplanationModel.js so it is
// testable without a JSX loader.
// ---------------------------------------------------------------------------

import React from "react";
import { buildSelectedSpeakerExplanation } from "./selectedSpeakerExplanationModel";

const BRAND = {
  border: "#E8E6E1",
  soft: "#F6F3EE",
  subtext: "#3E4349",
  hint: "#625143",
};

function Line({ label, children }) {
  return (
    <div style={{ fontSize: 11, lineHeight: 1.45, color: BRAND.subtext, marginBottom: 3 }}>
      <span style={{ fontWeight: 700, color: BRAND.hint }}>{label}: </span>
      {children}
    </div>
  );
}

export default function SelectedSpeakerExplanation({ record, candidate = null }) {
  const explanation = buildSelectedSpeakerExplanation(record, candidate);
  if (!explanation) return null;

  return (
    <div style={{ borderTop: `1px solid ${BRAND.border}`, padding: "10px 16px 12px", background: BRAND.soft }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: explanation.tone, marginBottom: 5 }}>
        {explanation.label}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: BRAND.subtext, marginBottom: 6 }}>
        {explanation.why}
      </div>
      {explanation.calculated && <Line label="What we've calculated">{explanation.calculated}</Line>}
      {explanation.assumed && <Line label="What we've assumed">{explanation.assumed}</Line>}
      {explanation.dontKnow && <Line label="What we don't know">{explanation.dontKnow}</Line>}
    </div>
  );
}