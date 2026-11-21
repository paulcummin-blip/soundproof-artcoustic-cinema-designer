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
import { PROVISIONAL_EXPLANATION, PEAK_TO_CONTINUOUS_FACTOR } from "@/components/utils/spl/peakPowerAssumption";

const BRAND = {
  border: "#DCDBD6",
  soft: "#F1F0EE",
  subtext: "#3E4349",
  hint: "#625143",
};

const NOT_PUBLISHED = "Not stated by manufacturer";
const AWAITING_APPROVAL = "Awaiting approval";
const NOT_REVIEWED = "Not yet reviewed";

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));

function textOrNull(value, suffix = "") {
  if (!hasValue(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${Number(n.toFixed(1))}${suffix}` : `${value}${suffix}`;
}

// SPL and sensitivity figures are displayed as whole-number decibels.
// The underlying values retain full precision; only the display is rounded.
function dbTextOrNull(value, suffix = "") {
  if (!hasValue(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}${suffix}` : `${value}${suffix}`;
}

function orUnstated(value, fallback = "Half Space — assumed by Sound Proof") {
  return String(value || "").trim() || fallback;
}

function sensitivityRow(record) {
  const v = dbTextOrNull(record.sensitivity_value_db, " dB");
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
  return dbTextOrNull(record.published_max_continuous_spl_db_1m, " dB @ 1 m") || NOT_PUBLISHED;
}

// The manufacturer's published max SPL figure that Sound Proof treats as peak
// (or assumed peak) when the manufacturer did not explicitly confirm continuous.
// Shown with its basis label so the reader can see the distinction.
function manufacturerMaxSplRow(record) {
  const authority = String(record.max_spl_authority_type || "").trim();
  if (authority !== "published_peak" && authority !== "assumed_peak") return null;
  const figure = record.halfspace_published_max_peak_spl_db_1m
    ?? record.halfspace_published_max_continuous_spl_db_1m;
  if (!hasValue(figure)) return null;
  const n = Number(figure);
  const value = Number.isFinite(n) ? Math.round(n) : figure;
  const label = authority === "published_peak"
    ? "Published peak maximum SPL"
    : "Manufacturer max SPL (continuous not specified)";
  return `${value} dB — ${label}`;
}

// The Sound Proof estimated continuous max SPL derived from a peak or
// unqualified max SPL via the −6 dB crest-factor allowance.
function estimatedContinuousSplRow(record) {
  if (!hasValue(record.halfspace_estimated_continuous_from_peak_spl_db_1m)) return null;
  const n = Number(record.halfspace_estimated_continuous_from_peak_spl_db_1m);
  const value = Number.isFinite(n) ? Math.round(n) : record.halfspace_estimated_continuous_from_peak_spl_db_1m;
  return `${value} dB — Sound Proof estimated continuous (assumed peak − 6 dB)`;
}

// A manufacturer-stated max SPL whose measurement basis was not explicitly
// established is preserved in max_spl_test_conditions as advisory text (set
// by buildSpecPatch when the basis is "manufacturer unspecified"). Surface it
// as "Manufacturer maximum SPL" so the figure is visible without being
// assigned to continuous or peak capability. Returns null when no such
// advisory text exists, so the row is not rendered.
function manufacturerStatedSplRow(record) {
  if (hasValue(record.published_max_continuous_spl_db_1m)) return null;
  const text = String(record.max_spl_test_conditions || "").trim();
  if (!text) return null;
  // Only surface when the text carries a dB figure — the basis label alone is
  // not a manufacturer max SPL statement.
  if (!/\d+\s*dB/i.test(text)) return null;
  return text;
}

function peakSplRow(record) {
  return dbTextOrNull(record.published_max_peak_spl_db_1m, " dB @ 1 m") || NOT_PUBLISHED;
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
  if (!hasPublishedSpl) {
    // When the manufacturer stated a max SPL but the basis was not established,
    // the figure lives in max_spl_test_conditions as advisory text. Surface
    // "Basis not stated" so the panel never implies the figure was measured.
    const advisory = String(record.max_spl_test_conditions || "").trim();
    if (/\d+\s*dB/i.test(advisory)) return "Basis not stated by manufacturer";
    return NOT_PUBLISHED;
  }
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
  if (record?.missing_sensitivity_with_power_rating === true) {
    return "Not calculated — sensitivity is not published, so the amplifier-dependent output cannot be determined. The published maximum SPL is shown as manufacturer information only.";
  }
  if (record?.provisional_peak_assumed === true) {
    return "Provisional estimate, calculated from sensitivity and assumed continuous-equivalent power (50% of published peak).";
  }
  const basis = String(record.capability_basis || "").trim();
  if (basis === "Published") return "Published continuous SPL figure";
  if (basis === "Estimated") return "Estimated continuous SPL (published max SPL − 6 dB), capping the sensitivity-and-power calculation";
  if (basis === "Calculated") {
    const calcSpl = dbTextOrNull(record.halfspace_calculated_max_continuous_spl_db_1m, " dB");
    return calcSpl
      ? `Calculated ${calcSpl} at 1 m from published sensitivity and amplifier power`
      : "Calculated from published sensitivity and amplifier power";
  }
  const label = String(record.spl_evidence_label || "").trim();
  if (label) return label;
  const authority = String(record.spl_authority || "").trim();
  return authority || NOT_PUBLISHED;
}

// Format a watt value for display in the provisional data rows.
function wattRow(value) {
  if (!hasValue(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${Number(n.toFixed(1))} W` : `${value} W`;
}

function whyText(adequacy, record) {
  // A provisional peak-to-continuous estimate without sensitivity cannot
  // produce a defensible amplifier-dependent output curve, so it stays
  // LIMITED DATA. The explanation states the assumption rather than saying
  // the calculation is unavailable.
  if (record?.provisional_peak_assumed === true
      && record?.halfspace_sensitivity_db_1w_1m == null) {
    return PROVISIONAL_EXPLANATION;
  }
  // GOOD: provisional peak estimate with published sensitivity. The
  // manufacturer publishes sensitivity, impedance, peak power handling and
  // (when present) maximum SPL, providing enough information for a credible
  // RP22 performance estimate.
  if (record?.provisional_peak_assumed === true) {
    const hasMaxSpl = record?.max_spl_authority_type === "published_peak"
      || record?.max_spl_authority_type === "assumed_peak";
    return hasMaxSpl
      ? "The manufacturer publishes sensitivity, impedance, peak power handling and maximum SPL, providing enough information for a credible RP22 performance estimate. Sound Proof estimates continuous-equivalent power from the peak rating and applies a −6 dB crest-factor allowance to the maximum SPL."
      : "The manufacturer publishes sensitivity, impedance and peak power handling, providing enough information for a credible RP22 performance estimate. Sound Proof estimates continuous-equivalent power from the published peak rating.";
  }
  if (adequacy.key === DATA_ADEQUACY.FULL.key) {
    return "Manufacturer publishes a continuous maximum SPL, so the RP22 capability figure is used directly.";
  }
  if (adequacy.key === DATA_ADEQUACY.GOOD.key) {
    const authority = String(record?.max_spl_authority_type || "").trim();
    // GOOD has two pathways. When the manufacturer publishes a maximum SPL
    // but does not confirm continuous output, Sound Proof applies the −6 dB
    // crest-factor allowance. When no maximum SPL is published, capability is
    // calculated from sensitivity and power — no −6 dB allowance applies.
    if (authority === "published_peak" || authority === "assumed_peak") {
      return "Manufacturer publishes a maximum SPL but does not confirm continuous output. Sound Proof applies a −6 dB crest-factor allowance to estimate continuous capability.";
    }
    return "Manufacturer does not publish a maximum SPL. Sound Proof calculates capability from the published sensitivity, impedance and power authority.";
  }
  // LIMITED: published continuous max SPL but missing sensitivity (passive
  // speaker). The manufacturer publishes a ceiling, but not the sensitivity
  // needed to estimate output at the selected amplifier power.
  if (adequacy.key === DATA_ADEQUACY.INCOMPLETE.key
      && record?.max_spl_authority_type === "published_continuous") {
    const spl = textOrNull(record?.halfspace_published_max_continuous_spl_db_1m, " dB");
    return `The manufacturer publishes maximum SPL${spl ? ` (${spl})` : ""}, but not the sensitivity needed to estimate output at different amplifier powers. Sound Proof cannot reliably predict P12/P13 performance at the selected amplifier setting.`;
  }
  // LIMITED — no published maximum SPL, or essential information is missing.
  if (record && record.p12_p13_eligible === true) {
    return "No published maximum SPL. Capability is estimated from sensitivity and power handling, so the comparison depends on calculated rather than directly published performance.";
  }
  return "Unable to calculate RP22 speaker capability from the information published by the manufacturer.";
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

  const manufacturerSpl = manufacturerStatedSplRow(record);
  const manufacturerMaxSpl = manufacturerMaxSplRow(record);
  const estimatedContinuous = estimatedContinuousSplRow(record);
  const isProvisional = record?.provisional_peak_assumed === true;
  const dataUsed = [
    ["Manufacturer", record.manufacturer || "—"],
    ["Model", record.model || "—"],
    ["Sensitivity", sensitivityRow(record)],
    ["Sensitivity reference", orUnstated(record.sensitivity_reference, "Unstated")],
    ["Nominal impedance", impedanceRow(record)],
    ["Power authority", powerAuthorityRow(record)],
    ["Continuous SPL (if published)", continuousSplRow(record)],
  ];
  // For a provisional peak-assumed result, show the published peak rating and
  // the assumed continuous-equivalent power as separate data rows so the
  // figures behind the estimate are fully visible.
  if (isProvisional) {
    const peakW = wattRow(record.published_peak_power_w);
    const assumedW = wattRow(record.assumed_continuous_power_w);
    if (peakW) dataUsed.push(["Manufacturer peak power handling", peakW]);
    if (assumedW) dataUsed.push(["Assumed continuous-equivalent power", assumedW]);
    dataUsed.push(["Calculation assumption", `${PEAK_TO_CONTINUOUS_FACTOR * 100}% of published peak power`]);
  }
  if (manufacturerMaxSpl) {
    dataUsed.push(["Manufacturer max SPL", manufacturerMaxSpl]);
  }
  if (estimatedContinuous) {
    dataUsed.push(["Sound Proof estimated continuous", estimatedContinuous]);
  }
  if (manufacturerSpl) {
    dataUsed.push(["Manufacturer maximum SPL", manufacturerSpl]);
  }
  dataUsed.push(
    ["Peak SPL (if published)", peakSplRow(record)],
    ["Max SPL basis", maxSplBasisRow(record)],
    ["Measurement basis", measurementBasisRow(record)],
  );

  const missing = missingInputs(record);
  const showMissing = adequacy.key === DATA_ADEQUACY.INCOMPLETE.key && missing.length > 0;

  return (
    <div>
      {/* 1. Data status */}
      <div style={{ fontSize: 12, fontWeight: 700, color: adequacy.tone, marginBottom: 4 }}>
        {adequacy.label}
      </div>

      {/* 1b. Publication state — admin-only draft candidates carry saved
            specification values that are not yet dealer-visible. */}
      {candidate?.publicationState === 'draft' && (
        <div style={{ fontSize: 11, color: BRAND.hint, marginBottom: 8, lineHeight: 1.4 }}>
          {candidate?.approvalStatus === 'Awaiting Review'
            ? `${AWAITING_APPROVAL} — submitted for review but not yet published. Not visible to dealers until approved and published.`
            : `${NOT_REVIEWED} — saved on the specification but not yet submitted for approval. Not visible to dealers until approved and published.`}
        </div>
      )}

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

    </div>
  );
}