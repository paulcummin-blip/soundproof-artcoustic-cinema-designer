// ExtractionEvidencePanel.jsx
// ---------------------------------------------------------------------------
// Read-only panel that surfaces the full ADI extraction result on the review
// screen: every reported field with its exact source quotation, fields the
// source did not state (not_found), and P12/P13 concepts the reader noticed
// but could not map to a field (potential_unmapped).
//
// This makes the extraction-to-review handoff auditable: the admin can see
// exactly what ADI read, what it missed, and what it was unsure about, before
// approving any value.
// ---------------------------------------------------------------------------

import React from "react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  soft: "#F1F0EE",
  panel: "#FFFFFF",
  amber: "#9A6E00",
  green: "#213428",
};

const FIELD_LABEL = {
  sensitivity_db: "Sensitivity (dB)",
  sensitivity_basis: "Sensitivity basis",
  nominal_impedance_ohm: "Nominal impedance (Ω)",
  minimum_impedance_ohm: "Minimum impedance (Ω)",
  recommended_amp_min_w: "Recommended amp min (W)",
  recommended_amp_max_w: "Recommended amp max (W)",
  long_term_iec_power_w: "Long-term IEC power (W)",
  rated_iec_power_w: "Rated IEC power (W)",
  aes_power_w: "AES power (W)",
  peak_power_w: "Peak power (W)",
  power_handling_continuous_w: "Continuous power handling (W)",
  power_handling_peak_w: "Peak power handling (W)",
  program_power_w: "Programme power (W)",
  frequency_response_low_hz: "Frequency response low (Hz)",
  frequency_response_high_hz: "Frequency response high (Hz)",
  frequency_response_tolerance: "Frequency response tolerance",
  frequency_response_tolerance_db: "Frequency response tolerance (dB)",
  max_continuous_spl_db: "Max continuous SPL (dB)",
  max_peak_spl_db: "Max peak SPL (dB)",
  max_spl_basis: "Max SPL basis",
  measurement_space: "Measurement space",
};

function labelFor(key) {
  return FIELD_LABEL[key] || key;
}

function QuoteBlock({ quote }) {
  if (!quote) return null;
  const trimmed = String(quote).trim();
  if (!trimmed) return null;
  return (
    <div style={{ fontSize: 10, color: BRAND.hint, marginTop: 3, fontStyle: "italic", lineHeight: 1.4 }}>
      &ldquo;{trimmed.slice(0, 200)}{trimmed.length > 200 ? "\u2026" : ""}&rdquo;
    </div>
  );
}

export default function ExtractionEvidencePanel({ extractionEvidence }) {
  if (!extractionEvidence) return null;

  const reported = extractionEvidence.reported || [];
  const ambiguous = extractionEvidence.ambiguous || [];
  const notFound = extractionEvidence.not_found || [];
  const unmapped = extractionEvidence.potential_unmapped || [];
  const hasContent = reported.length > 0 || ambiguous.length > 0 || notFound.length > 0 || unmapped.length > 0;

  if (!hasContent) return null;

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.panel, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.text }}>
          ADI extraction evidence
        </div>
        {extractionEvidence.source_url && (
          <a
            href={extractionEvidence.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: BRAND.subtext, textDecoration: "none", wordBreak: "break-all" }}
          >
            {extractionEvidence.source_url}
          </a>
        )}
      </div>

      {extractionEvidence.model_confirmed === false && (
        <div style={{ fontSize: 11, color: BRAND.amber }}>
          The source did not explicitly name this exact model. Review each value before accepting.
        </div>
      )}

      {(reported.length > 0 || ambiguous.length > 0) && (
        <div style={{ border: `1px solid ${BRAND.soft}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: BRAND.soft }}>
              <tr>
                {["Field", "Value", "Status", "Source quote"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.hint, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...reported.map((r) => ({ ...r, status: "reported" })), ...ambiguous.map((a) => ({ ...a, status: "ambiguous" }))].map((entry, i) => (
                <tr key={`${entry.field}-${i}`} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                  <td style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, color: BRAND.text, verticalAlign: "top" }}>
                    {labelFor(entry.field)}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 12, color: BRAND.text, verticalAlign: "top" }}>
                    {String(entry.value ?? "")}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 11, verticalAlign: "top" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999,
                      background: entry.status === "reported" ? `${BRAND.green}14` : `${BRAND.amber}14`,
                      color: entry.status === "reported" ? BRAND.green : BRAND.amber,
                    }}>
                      {entry.status === "reported" ? "Reported" : "Ambiguous"}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px", verticalAlign: "top" }}>
                    <QuoteBlock quote={entry.raw_text} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notFound.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 4 }}>
            Not stated in source
          </div>
          <div style={{ fontSize: 11, color: BRAND.subtext }}>
            {notFound.slice(0, 20).map(labelFor).join(", ")}{notFound.length > 20 ? "\u2026" : ""}. These stay blank — no value is invented.
          </div>
        </div>
      )}

      {unmapped.length > 0 && (
        <div style={{ padding: "10px 12px", border: `1px solid ${BRAND.amber}55`, borderRadius: 8, background: `${BRAND.amber}08` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.amber, marginBottom: 4 }}>
            Potential field not mapped
          </div>
          {unmapped.map((u, i) => (
            <div key={i} style={{ fontSize: 12, color: BRAND.text, marginTop: 4 }}>
              <strong>{u.concept || "Unnamed concept"}</strong>
              <QuoteBlock quote={u.raw_text} />
            </div>
          ))}
          <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4 }}>
            ADI noticed this P12/P13-relevant specification but could not map it to a field. Review the source and enter the value manually if needed.
          </div>
        </div>
      )}
    </div>
  );
}