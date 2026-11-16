// ComparisonDataStatusSection.jsx
// ---------------------------------------------------------------------------
// The competitor data-status section shown inside the RP22 comparison info
// panel. It replaces the former "Limited published data" wording with the ONE
// data-adequacy vocabulary used everywhere else — FULL DATA / GOOD DATA /
// INCOMPLETE DATA — classified by the same classifyDataAdequacy authority the
// admin Manage Competitor Speakers table and the readiness list use, so the
// panel can never disagree with the row badge or the admin table.
//
// It is presentation only: it reads the stored, normalised record and the
// candidate's assumptions. It performs no calculation and changes no stored
// value, threshold or grade.
//
// Compact order:
//   1. Data status   — FULL DATA / GOOD DATA / INCOMPLETE DATA
//   2. Why           — a plain sentence for this status
//   3. Data used     — the comparison evidence (manufacturer/model, sensitivity,
//                      sensitivity reference, nominal impedance, power authority,
//                      published continuous SPL if any, measurement basis)
//   4. Assumptions   — the controlled assumptions, or "None — published values only"
//   5. Result method — how the graded SPL figure was obtained
//   6. Price         — retail inc VAT
//   7. Source        — manufacturer source / datasheet links

import React from "react";
import { DATA_ADEQUACY, classifyDataAdequacy } from "./dataAdequacyClassification";
import DataQualityGuide from "./DataQualityGuide";

const BRAND = {
  border: "#DCDBD6",
  soft: "#F1F0EE",
  subtext: "#3E4349",
  hint: "#625143",
};

const NOT_PUBLISHED = "Not published";

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));

function textOrNull(value, suffix = "") {
  if (!hasValue(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${Number(n.toFixed(1))}${suffix}` : `${value}${suffix}`;
}

function orUnstated(value, fallback = "Half Space — assumed by Sound Proof") {
  return String(value || "").trim() || fallback;
}

function sensitivityRow(record) {
  const v = textOrNull(record.sensitivity_value_db, " dB");
  return v ? `${v} @ ${record.sensitivity_reference || "basis unstated"}` : NOT_PUBLISHED;
}

function impedanceRow(record) {
  const ohm = record.rated_impedance_ohm ?? record.sensitivity_impedance_used_ohm;
  return textOrNull(ohm, " Ω") || NOT_PUBLISHED;
}

function powerAuthorityRow(record) {
  const w = textOrNull(record.power_authority_w, " W");
  const label = String(record.power_authority || "").trim();
  if (w && label) return `${w} · ${label}`;
  if (w) return w;
  if (label) return label;
  return NOT_PUBLISHED;
}

function continuousSplRow(record) {
  return textOrNull(record.published_max_continuous_spl_db_1m, " dB @ 1 m") || NOT_PUBLISHED;
}

function peakSplRow(record) {
  return textOrNull(record.published_max_peak_spl_db_1m, " dB @ 1 m") || NOT_PUBLISHED;
}

function measurementBasisRow(record) {
  const basis = String(record.sensitivity_measurement_basis || record.max_spl_measurement_basis || "").trim();
  return basis || "Half Space — assumed by Sound Proof";
}

// The measurement basis the manufacturer stated for a published max SPL figure.
// "Basis not stated" is shown explicitly when a max SPL is published but the
// manufacturer did not state the measurement space — it is never silently
// upgraded to an assumption. Returns NOT_PUBLISHED when no max SPL exists.
function maxSplBasisRow(record) {
  const hasPublishedSpl = hasValue(record.published_max_continuous_spl_db_1m)
    || hasValue(record.published_max_peak_spl_db_1m);
  if (!hasPublishedSpl) return NOT_PUBLISHED;
  const basis = String(record.max_spl_measurement_basis || "").trim();
  if (basis) return basis;
  // The manufacturer's own test-conditions text, if any.
  const testConditions = String(record.max_spl_test_conditions || "").trim();
  if (testConditions) return testConditions;
  return "Basis not stated";
}

// The exact missing inputs that prevent a P12/P13 calculation, read from the
// normaliser's own warnings. Empty when the record is eligible.
function missingInputs(record) {
  const warnings = Array.isArray(record?.normalization_warnings) ? record.normalization_warnings : [];
  return warnings.map((w) => String(w || "").trim()).filter(Boolean);
}

function resultMethodText(record) {
  const basis = String(record.capability_basis || "").trim();
  if (basis === "Published") return "Published continuous SPL figure";
  if (basis === "Calculated") return "Calculated from published sensitivity and amplifier power";
  const label = String(record.spl_evidence_label || "").trim();
  if (label) return label;
  const authority = String(record.spl_authority || "").trim();
  return authority || NOT_PUBLISHED;
}

function whyText(adequacy, record) {
  if (adequacy.key === DATA_ADEQUACY.FULL.key) {
    return "Enough transparent manufacturer evidence for a like-for-like P12/P13 comparison on the same basis used for Artcoustic.";
  }
  if (adequacy.key === DATA_ADEQUACY.INCOMPLETE.key) {
    return "Unable to calculate RP22 speaker capability from the information published by the manufacturer.";
  }
  // GOOD — tailor the sentence to what is actually published.
  const publishedSpl = hasValue(record.published_max_continuous_spl_db_1m);
  const lead = "A defensible comparison is possible using manufacturer-published sensitivity and amplifier guidance.";
  if (!publishedSpl) return `${lead} No published continuous SPL figure, so capability is calculated from sensitivity and amplifier power.`;
  return lead;
}

function Row({ label, value, first = false }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.15fr 1fr",
        gap: 10,
        padding: "5px 0",
        borderTop: first ? 0 : `1px solid ${BRAND.soft}`,
        fontSize: 11,
        lineHeight: 1.35,
      }}
    >
      <div style={{ color: BRAND.subtext }}>{label}</div>
      <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value || "—"}</div>
    </div>
  );
}

export default function ComparisonDataStatusSection({
  record,
  candidate = null,
  price = null,
  sourceUrl = null,
  datasheetUrl = null,
}) {
  if (!record) return null;
  const adequacy = candidate?.adequacy || classifyDataAdequacy(record);
  const assumptions = Array.isArray(candidate?.assumptions) ? candidate.assumptions : [];

  const dataUsed = [
    ["Manufacturer", record.manufacturer || "—"],
    ["Model", record.model || "—"],
    ["Sensitivity", sensitivityRow(record)],
    ["Sensitivity reference", orUnstated(record.sensitivity_reference, "Unstated")],
    ["Nominal impedance", impedanceRow(record)],
    ["Power authority", powerAuthorityRow(record)],
    ["Continuous SPL (if published)", continuousSplRow(record)],
    ["Peak SPL (if published)", peakSplRow(record)],
    ["Max SPL basis", maxSplBasisRow(record)],
    ["Measurement basis", measurementBasisRow(record)],
  ];

  const missing = missingInputs(record);
  const showMissing = adequacy.key === DATA_ADEQUACY.INCOMPLETE.key && missing.length > 0;

  return (
    <div>
      {/* 1. Data status */}
      <div style={{ fontSize: 12, fontWeight: 700, color: adequacy.tone, marginBottom: 4 }}>
        {adequacy.label}
      </div>

      {/* 2. Why */}
      <div style={{ fontSize: 11, lineHeight: 1.45, color: BRAND.subtext, marginBottom: 8 }}>
        {whyText(adequacy, record)}
      </div>

      {/* 2b. Missing inputs — the exact fields preventing calculation */}
      {showMissing && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 2 }}>
            Missing inputs
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: BRAND.subtext, marginBottom: 8 }}>
            {missing.map((m) => (
              <div key={m} style={{ display: "list-item", marginLeft: 16, marginBottom: 1 }}>{m}</div>
            ))}
          </div>
        </>
      )}

      {/* 3. Data used */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 2 }}>
        Data used
      </div>
      <div style={{ display: "grid", gap: 0, marginBottom: 8 }}>
        {dataUsed.map(([label, value], idx) => (
          <Row key={label} label={label} value={value} first={idx === 0} />
        ))}
      </div>

      {/* 4. Assumptions */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 2 }}>
        Assumptions
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: BRAND.subtext, marginBottom: 8 }}>
        {assumptions.length > 0 ? assumptions.join(" · ") : "None — published values only"}
      </div>

      {/* 5. Result method */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 2 }}>
        Result method
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: BRAND.subtext, marginBottom: 8 }}>
        {resultMethodText(record)}
      </div>

      {/* 6. Price */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 2 }}>
        Price
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.subtext, marginBottom: 8 }}>
        {price || "—"}
      </div>

      {/* 7. Source */}
      {(sourceUrl || datasheetUrl) && (
        <div
          style={{
            paddingTop: 8,
            borderTop: `1px solid ${BRAND.border}`,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 11,
          }}
        >
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>
              Manufacturer source
            </a>
          )}
          {datasheetUrl && (
            <a href={datasheetUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>
              Datasheet
            </a>
          )}
        </div>
      )}

      {/* 8. Understanding data quality — the same explanation shown in the
            RP22 reference section, so the classifications are accessible
            wherever data-quality status is displayed. */}
      <DataQualityGuide variant="compact" />
    </div>
  );
}