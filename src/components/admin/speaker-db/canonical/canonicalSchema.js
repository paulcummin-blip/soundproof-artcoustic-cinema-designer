// canonicalSchema.js
// ---------------------------------------------------------------------------
// The versioned workbook schema for the canonical Speaker Database
// (SpeakerManufacturer -> SpeakerProduct -> SpeakerSpecification).
//
// This is the ONE definition of what a workbook column means: which entity it
// belongs to, which field it writes, what type it is, and whether the import is
// allowed to write it at all. The exporter, the reader, the diff engine, the
// Instructions sheet and the Field Definitions sheet are all generated from
// this list, so the workbook can never describe itself differently from the way
// it is read.
//
// Read-only columns are exported for the admin and for the round-trip evidence,
// and the import ignores them completely: approval state and RP22 publication
// state are managed in Sound Proof, never by a spreadsheet.
// ---------------------------------------------------------------------------

export const CANONICAL_SCHEMA_VERSION = "speaker-database-schema-v1";

// A cell containing exactly this token deliberately removes a value. A blank
// cell never does - it means "leave the existing value unchanged".
export const CLEAR_TOKEN = "[CLEAR]";

export const CHANGE_LOG_TYPES = ["ADD", "UPDATE", "REVIEW", "SOURCE IMPROVED"];

export const SHEET_NAMES = {
  data: "Speaker Data",
  instructions: "Instructions",
  fields: "Field Definitions",
  changeLog: "Change Log",
  reference: "Reference (read-only)",
};

const PRODUCT_TYPES = ["On Wall", "In Wall", "Freestanding", "Other"];
const ROLES = ["LCR", "Surround", "Both", "Wide", "Height", "Flexible"];
const STATUSES = ["Current", "Discontinued", "Coming Soon", "Hidden", "Archived", "Unknown"];
const SENSITIVITY_BASES = ["1W/1m", "2.83V/1m", "unknown"];
const SPL_BASES = ["AES", "IEC", "continuous", "peak", "manufacturer unspecified", "calculated", "unknown"];
const MEASUREMENT_SPACES = ["free-space", "half-space", "in-room", "unspecified"];
const CONFIDENCE_LEVELS = ["A", "B", "C", "D"];
const EVIDENCE_QUALITIES = [
  "Manufacturer Published",
  "Manufacturer Calculated",
  "Engineering Estimate",
  "Unknown",
];

// order matters: the workbook columns are written in exactly this sequence.
export const COLUMNS = [
  // --- Identity -----------------------------------------------------------
  { key: "manufacturer_id", label: "Manufacturer ID", group: "Identity", target: "manufacturer", field: "id", type: "text", editable: false,
    note: "Stable ID. Never edit. Blank on a new manufacturer." },
  { key: "manufacturer", label: "Manufacturer", group: "Identity", target: "manufacturer", field: "name", type: "text", editable: true,
    note: "Manufacturer name. A new name with no manufacturer_id creates a new manufacturer record." },
  { key: "product_id", label: "Product ID", group: "Identity", target: "product", field: "id", type: "text", editable: false,
    note: "Stable ID. Never edit. Blank on a new product." },
  { key: "model", label: "Model", group: "Identity", target: "product", field: "model", type: "text", editable: true,
    note: "Model name/number." },
  { key: "product_type", label: "Product type", group: "Identity", target: "product", field: "category", type: "select", options: PRODUCT_TYPES, editable: true,
    note: "Physical form factor." },
  { key: "series", label: "Series", group: "Identity", target: "product", field: "series", type: "text", editable: true,
    note: "Product series name." },
  { key: "specification_id", label: "Specification ID", group: "Identity", target: "spec", field: "id", type: "text", editable: false,
    note: "Stable ID of the current specification. Never edit." },
  { key: "specification_version", label: "Specification version", group: "Identity", target: "spec", field: "version_label", type: "text", editable: true,
    note: "Version label of the current specification (e.g. 2026, v1.2)." },
  { key: "is_current_specification", label: "Is current specification", group: "Identity", target: "spec", field: "is_current", type: "boolean", editable: false,
    note: "Managed by Sound Proof. Always the current specification on this workbook." },

  // --- Product data -------------------------------------------------------
  { key: "role", label: "Role", group: "Product", target: "product", field: "role", type: "select", options: ROLES, editable: true,
    note: "Speaker role, separate from the physical form factor." },
  { key: "status", label: "Status", group: "Product", target: "product", field: "status", type: "select", options: STATUSES, editable: true,
    note: "Product lifecycle status." },
  { key: "open_back", label: "Open back", group: "Product", target: "spec", field: "open_back", type: "text", editable: true,
    note: "Y/N. Open-back in-wall designs are flagged in the comparison." },
  { key: "sensitivity_db", label: "Sensitivity (dB)", group: "Product", target: "spec", field: "sensitivity_db", type: "number", editable: true,
    note: "Published sensitivity, as published." },
  { key: "sensitivity_reference", label: "Sensitivity reference", group: "Product", target: "spec", field: "sensitivity_basis", type: "select", options: SENSITIVITY_BASES, editable: true,
    note: "The reference the sensitivity was quoted against. unknown is an honest answer." },
  { key: "sensitivity_impedance_ohm", label: "Sensitivity impedance (ohm)", group: "Product", target: "spec", field: "sensitivity_impedance_used_ohm", type: "number", editable: true,
    note: "Impedance the sensitivity was quoted at." },
  { key: "sensitivity_measurement_basis", label: "Sensitivity measurement basis", group: "Product", target: "spec", field: "sensitivity_measurement_basis", type: "text", editable: true,
    note: "Full Space or Half Space. Blank means unstated, which is assumed half space downstream." },
  { key: "continuous_power_w", label: "Continuous power (W)", group: "Product", target: "spec", field: "power_handling_continuous_w", type: "number", editable: true,
    note: "Continuous power handling. Blank rather than inferred from AES or peak figures." },
  { key: "program_power_w", label: "Program power (W)", group: "Product", target: "spec", field: "program_power_w", type: "number", editable: true,
    note: "Program power where the manufacturer states one." },
  { key: "peak_power_w", label: "Peak power (W)", group: "Product", target: "spec", field: "power_handling_peak_w", type: "number", editable: true,
    note: "Peak power where the manufacturer states one." },
  { key: "recommended_amp_min_w", label: "Recommended amp min (W)", group: "Product", target: "spec", field: "recommended_amp_min_w", type: "number", editable: true,
    note: "Lower bound of the recommended amplifier range." },
  { key: "recommended_amp_max_w", label: "Recommended amp max (W)", group: "Product", target: "spec", field: "recommended_amp_max_w", type: "number", editable: true,
    note: "Upper bound of the recommended amplifier range." },
  { key: "published_continuous_spl_db_1m", label: "Published continuous SPL (dB @ 1 m)", group: "Product", target: "spec", field: "max_continuous_spl_db", type: "number", editable: true,
    note: "Published maximum continuous SPL, as published." },
  { key: "published_peak_spl_db_1m", label: "Published peak SPL (dB @ 1 m)", group: "Product", target: "spec", field: "max_peak_spl_db", type: "number", editable: true,
    note: "Published maximum peak SPL, as published." },
  { key: "spl_measurement_basis", label: "Max SPL basis", group: "Product", target: "spec", field: "max_spl_basis", type: "select", options: SPL_BASES, editable: true,
    note: "Basis behind the published max SPL figure. Never inferred." },
  { key: "spl_measurement_space", label: "Max SPL measurement basis", group: "Product", target: "spec", field: "max_spl_measurement_basis", type: "text", editable: true,
    note: "Full Space or Half Space for the max SPL figure. Independent of the sensitivity basis." },
  { key: "measurement_space", label: "Measurement space", group: "Product", target: "spec", field: "measurement_space", type: "select", options: MEASUREMENT_SPACES, editable: true,
    note: "Acoustic space the published figures were measured in." },
  { key: "frequency_low_hz", label: "Frequency low (Hz)", group: "Product", target: "spec", field: "frequency_response_low_hz", type: "number", editable: true,
    note: "Lowest stated frequency response." },
  { key: "frequency_high_hz", label: "Frequency high (Hz)", group: "Product", target: "spec", field: "frequency_response_high_hz", type: "number", editable: true,
    note: "Highest stated frequency response." },
  { key: "frequency_tolerance", label: "Frequency tolerance", group: "Product", target: "spec", field: "frequency_response_tolerance", type: "text", editable: true,
    note: "Stated tolerance, e.g. ±3dB or -6dB." },
  { key: "usable_lf_hz", label: "Usable LF point (Hz)", group: "Product", target: "spec", field: "usable_lf_minus6db_hz", type: "number", editable: true,
    note: "Usable low-frequency point where the manufacturer states one." },
  { key: "coverage_horizontal_deg", label: "Coverage horizontal (deg)", group: "Product", target: "spec", field: "horizontal_dispersion_deg", type: "number", editable: true,
    note: "Horizontal dispersion." },
  { key: "coverage_vertical_deg", label: "Coverage vertical (deg)", group: "Product", target: "spec", field: "vertical_dispersion_deg", type: "number", editable: true,
    note: "Vertical dispersion." },
  { key: "sensitivity_test_conditions", label: "Sensitivity test conditions", group: "Product", target: "spec", field: "sensitivity_band_conditions", type: "text", editable: true,
    note: "Band and conditions the sensitivity was quoted under." },
  { key: "max_spl_test_conditions", label: "Max SPL test conditions", group: "Product", target: "spec", field: "max_spl_test_conditions", type: "text", editable: true,
    note: "Standard and conditions the max SPL was quoted under." },
  { key: "nominal_impedance_ohm", label: "Nominal impedance (ohm)", group: "Product", target: "spec", field: "nominal_impedance_ohm", type: "number", editable: true,
    note: "Nominal impedance." },
  { key: "minimum_impedance_ohm", label: "Minimum impedance (ohm)", group: "Product", target: "spec", field: "minimum_impedance_ohm", type: "number", editable: true,
    note: "Minimum impedance." },
  { key: "cabinet_type", label: "Cabinet type", group: "Product", target: "spec", field: "cabinet_type", type: "text", editable: true,
    note: "Cabinet construction." },
  { key: "mounting_type", label: "Mounting type", group: "Product", target: "spec", field: "mounting_type", type: "text", editable: true,
    note: "Mounting / installation type." },
  { key: "retail_price", label: "Retail price (read-only)", group: "Product", target: "derived", field: "retail_price", type: "text", editable: false,
    note: "Read-only. Retail pricing is maintained in the Product Master / Price List, not in the Speaker Database. Exported blank and never written by import." },
  { key: "currency", label: "Currency (read-only)", group: "Product", target: "derived", field: "currency", type: "text", editable: false,
    note: "Read-only. See retail_price." },

  // --- Provenance ---------------------------------------------------------
  { key: "source_url", label: "Source URL", group: "Provenance", target: "product", field: "official_product_url", type: "text", editable: true,
    note: "Official manufacturer product page." },
  { key: "datasheet_url", label: "Datasheet URL", group: "Provenance", target: "spec", field: "datasheet_url", type: "text", editable: true,
    note: "Official datasheet used as the primary source." },
  { key: "source_title", label: "Source title", group: "Provenance", target: "spec", field: "primary_source", type: "text", editable: true,
    note: "Primary source reference for the specification data." },
  { key: "source_date", label: "Source date", group: "Provenance", target: "spec", field: "source_date", type: "date", editable: true,
    note: "Date the source document was published or last checked (YYYY-MM-DD)." },
  { key: "date_checked", label: "Date checked", group: "Provenance", target: "spec", field: "last_verified", type: "date", editable: true,
    note: "Date the values were last verified against the source (YYYY-MM-DD)." },
  { key: "evidence_notes", label: "Evidence notes", group: "Provenance", target: "spec", field: "notes", type: "text", editable: true,
    note: "Engineering notes and caveats that travel with the data." },
  { key: "confidence", label: "Confidence", group: "Provenance", target: "spec", field: "confidence", type: "select", options: CONFIDENCE_LEVELS, editable: true,
    note: "Data quality: A published, B calculated, C estimated, D engineering estimate." },
  { key: "evidence_quality", label: "Evidence quality", group: "Provenance", target: "spec", field: "evidence_quality", type: "select", options: EVIDENCE_QUALITIES, editable: true,
    note: "Quality of the evidence behind the values." },
  { key: "approval_status", label: "Approval status", group: "Provenance", target: "spec", field: "approval_status", type: "text", editable: false,
    note: "Read-only. Managed in Sound Proof. A changed specification is set to Awaiting Review by the import." },
  { key: "publication_status", label: "Publication status", group: "Provenance", target: "derived", field: "publication_status", type: "text", editable: false,
    note: "Read-only. Whether this specification has been published to the RP22 comparison. Import never publishes." },
];

export const EDITABLE_COLUMNS = COLUMNS.filter((column) => column.editable === true);

export const DATA_COLUMN_KEYS = COLUMNS.map((column) => column.key);

export function findColumn(key) {
  return COLUMNS.find((column) => column.key === key) || null;
}