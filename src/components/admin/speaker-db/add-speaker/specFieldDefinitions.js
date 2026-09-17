// specFieldDefinitions.js
// ---------------------------------------------------------------------------
// Shared specification field definitions for the Add Speaker wizard.
// Mirrors the field groups used by AdminSpeakerProductDetail so the Review
// step shows the same fields in the same order.
//
// Each field defines:
//   key   — SpeakerSpecification field name
//   label — Human-readable label
//   type  — input type: text, number, boolean, select, date
//   options (select only) — selectable values
//   range  (number only) — { min, max } valid range for Out-of-Range validation
//   authorityOptions — source types that can be assigned as field_authority
// ---------------------------------------------------------------------------

export const SPEC_GROUPS = [
  {
    label: "Physical",
    fields: [
      { key: "cabinet_type", label: "Cabinet Type", type: "text" },
      { key: "mounting_type", label: "Mounting Type", type: "text" },
      { key: "woofer_count", label: "Woofer Count", type: "number" },
      { key: "woofer_size", label: "Woofer Size", type: "text" },
      { key: "midrange_count", label: "Midrange Count", type: "number" },
      { key: "midrange_size", label: "Midrange Size", type: "text" },
      { key: "tweeter_description", label: "Tweeter Description", type: "text" },
      { key: "compression_driver", label: "Compression Driver", type: "boolean" },
      { key: "coaxial", label: "Coaxial", type: "boolean" },
      { key: "height_mm", label: "Height (mm)", type: "number", range: { min: 50, max: 2000 } },
      { key: "width_mm", label: "Width (mm)", type: "number", range: { min: 50, max: 2000 } },
      { key: "depth_mm", label: "Depth (mm)", type: "number", range: { min: 30, max: 1000 } },
      { key: "weight_kg", label: "Weight (kg)", type: "number", range: { min: 0.1, max: 200 } },
    ],
  },
  {
    label: "Electrical",
    fields: [
      { key: "sensitivity_db", label: "Sensitivity (dB)", type: "number", range: { min: 75, max: 105 } },
      { key: "nominal_impedance_ohm", label: "Nominal Impedance (Ω)", type: "number", range: { min: 2, max: 16 } },
      { key: "minimum_impedance_ohm", label: "Minimum Impedance (Ω)", type: "number", range: { min: 1, max: 32 } },
      { key: "recommended_amp_min_w", label: "Recommended Amp Min (W)", type: "number", range: { min: 1, max: 2000 } },
      { key: "recommended_amp_max_w", label: "Recommended Amp Max (W)", type: "number", range: { min: 1, max: 5000 } },
      { key: "long_term_iec_power_w", label: "Long Term IEC Power (W)", type: "number", range: { min: 1, max: 2000 } },
      { key: "rated_iec_power_w", label: "Rated IEC Power (W)", type: "number", range: { min: 1, max: 2000 } },
      { key: "aes_power_w", label: "AES Power (W)", type: "number", range: { min: 1, max: 2000 } },
      { key: "peak_power_w", label: "Peak Power (W)", type: "number", range: { min: 1, max: 10000 } },
    ],
  },
  {
    label: "Acoustic",
    fields: [
      { key: "frequency_response_low_hz", label: "Frequency Response Low (Hz)", type: "number", range: { min: 10, max: 200 } },
      { key: "frequency_response_high_hz", label: "Frequency Response High (Hz)", type: "number", range: { min: 1000, max: 50000 } },
      { key: "frequency_response_tolerance", label: "Frequency Response Tolerance", type: "text" },
      { key: "max_continuous_spl_db", label: "Max Continuous SPL (dB)", type: "number", range: { min: 85, max: 140 } },
      { key: "max_peak_spl_db", label: "Max Peak SPL (dB)", type: "number", range: { min: 90, max: 150 } },
      { key: "horizontal_dispersion_deg", label: "Horizontal Dispersion (°)", type: "number", range: { min: 10, max: 360 } },
      { key: "vertical_dispersion_deg", label: "Vertical Dispersion (°)", type: "number", range: { min: 10, max: 360 } },
      { key: "thx_certification", label: "THX Certification", type: "text" },
    ],
  },
  {
    label: "Metadata",
    fields: [
      { key: "primary_source", label: "Primary Source", type: "text" },
      { key: "confidence", label: "Confidence", type: "select", options: ["", "A", "B", "C", "D"] },
      { key: "evidence_quality", label: "Evidence Quality", type: "select", options: ["", "Manufacturer Published", "Manufacturer Calculated", "Engineering Estimate", "Unknown"] },
      { key: "last_verified", label: "Last Verified", type: "date" },
    ],
  },
];

// Flattened list of all spec fields (for iteration)
export const ALL_SPEC_FIELDS = SPEC_GROUPS.flatMap((g) => g.fields);

// Fields considered for completeness scoring (subset — the engineering-critical fields)
export const COMPLETENESS_FIELDS = [
  "sensitivity_db",
  "frequency_response_low_hz",
  "frequency_response_high_hz",
  "max_continuous_spl_db",
  "max_peak_spl_db",
  "nominal_impedance_ohm",
  "cabinet_type",
  "mounting_type",
  "woofer_count",
  "woofer_size",
  "tweeter_description",
  "height_mm",
  "width_mm",
  "depth_mm",
  "weight_kg",
  "horizontal_dispersion_deg",
  "vertical_dispersion_deg",
];

// Authority options for field_authority dropdown.
// Ordered by priority (1 = highest). See sourcePriority.js for the ranking.
export const AUTHORITY_OPTIONS = [
  { value: "", label: "—" },
  { value: "Official Product Page", label: "Product Page" },
  { value: "Official PDF", label: "Spec PDF" },
  { value: "Official Series Brochure", label: "Series Brochure" },
  { value: "Official Manual", label: "Manual" },
  { value: "Engineering Document", label: "Engineering Doc" },
  { value: "Support Article", label: "Support Article" },
];

// Confidence level descriptions for colour coding
export const CONFIDENCE_LABELS = {
  A: { label: "Published", color: "#213428" },
  B: { label: "Calculated", color: "#3E4349" },
  C: { label: "Estimated", color: "#9A6E00" },
  D: { label: "Engineering Estimate", color: "#B23A3A" },
};