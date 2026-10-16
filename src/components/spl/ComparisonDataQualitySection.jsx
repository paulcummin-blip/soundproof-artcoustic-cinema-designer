import React from "react";

// WHY A COMPARISON ROW IS CLASSIFIED "LIMITED DATA".
//
// A row is Limited Data when the manufacturer has not published enough for the
// capability to be read straight off a datasheet: typically there is no published
// continuous power rating and no published continuous SPL figure, so the comparison
// capability rests on the manufacturer's stated sensitivity plus their recommended
// amplifier maximum, with the measurement space unstated and therefore assumed half
// space.
//
// This section states that plainly, inside the speaker's own info drawer. It only
// reads the stored evidence and the existing classification: it performs no
// calculation, changes no stored value, and cannot affect a P12/P13 grade. The
// short "Limited Data" badge on the comparison row is unchanged, and the full
// explanation is never repeated in the comparison row itself.

const BRAND = {
  border: "#DCDBD6",
  subtext: "#3E4349",
  hint: "#625143",
  soft: "#F1F0EE",
};

const LIMITED_DATA = "Limited Data";
const NOT_PUBLISHED = "Not published";
const UNSTATED_BASIS = "Unstated — half-space assumed";

const EXPLANATION =
  "Sound Proof has calculated the comparison capability from the available manufacturer data. " +
  "Treat this result as an informed estimate rather than a directly published continuous SPL figure.";

function publishedValue(value, suffix) {
  const figure = Number(value);
  const absent = value === null
    || value === undefined
    || String(value).trim() === ""
    || !Number.isFinite(figure)
    || figure <= 0;
  if (absent) return NOT_PUBLISHED;
  return `${Number(figure.toFixed(1))}${suffix}`;
}

function statedBasis(value) {
  return String(value || "").trim() || UNSTATED_BASIS;
}

function powerAuthorityText(record) {
  return String(record.power_authority || "").trim() || NOT_PUBLISHED;
}

function finalCapabilityText(record) {
  const basis = String(record.capability_basis || "").trim();
  if (basis === "Calculated") return "Calculated from published sensitivity and amplifier data";
  if (basis === "Published") return "Published continuous SPL figure";
  return String(record.spl_authority || "").trim() || NOT_PUBLISHED;
}

export default function ComparisonDataQualitySection({ record, badgeLabel }) {
  if (!record || badgeLabel !== LIMITED_DATA) return null;

  const rows = [
    ["Continuous power", publishedValue(record.continuous_power_w, " W")],
    ["Published continuous SPL", publishedValue(record.published_max_continuous_spl_db_1m, " dB @ 1 m")],
    ["Sensitivity measurement basis", statedBasis(record.sensitivity_measurement_basis)],
    ["SPL measurement basis", statedBasis(record.max_spl_measurement_basis)],
    ["Power authority", powerAuthorityText(record)],
    ["Final capability", finalCapabilityText(record)],
  ];

  return (
    <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${BRAND.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 6 }}>
        Data quality
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#9A6E00", marginBottom: 6 }}>
        Limited published data
      </div>
      <div style={{ display: "grid", gap: 0 }}>
        {rows.map(([label, value], idx) => (
          <div
            key={label}
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 1fr",
              gap: 10,
              padding: "5px 0",
              borderTop: idx === 0 ? 0 : `1px solid ${BRAND.soft}`,
              fontSize: 11,
              lineHeight: 1.35,
            }}
          >
            <div style={{ color: BRAND.subtext }}>{label}</div>
            <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.45, color: BRAND.subtext }}>
        {EXPLANATION}
      </div>
    </div>
  );
}