// addSpeakerValidation.js
// ---------------------------------------------------------------------------
// Validation engine for the Add Speaker wizard.
// Generates data quality issues: Missing, Out of Range, Warnings (low
// confidence), and Conflicts (placeholder for future multi-source).
//
// This is NOT AI. It is deterministic rule-based validation against the
// field definitions and valid ranges defined in specFieldDefinitions.js.
//
// Output: { issues: [...], completeness: number, summary: {...} }
// Each issue: { field, severity, status, message }
// ---------------------------------------------------------------------------

import { ALL_SPEC_FIELDS, COMPLETENESS_FIELDS } from "./specFieldDefinitions.js";

/**
 * Run validation on a draft specification.
 * @param {object} spec - SpeakerSpecification data
 * @returns {object} { issues, completeness, summary }
 */
export function validateDraftSpec(spec) {
  const issues = [];

  if (!spec) return { issues, completeness: 0, summary: { missing: 0, outOfRange: 0, warnings: 0, conflicts: 0 } };

  // ── Missing fields ──────────────────────────────────────────────────
  for (const fieldKey of COMPLETENESS_FIELDS) {
    const val = spec[fieldKey];
    if (val == null || val === "") {
      issues.push({
        field: fieldKey,
        severity: "Critical",
        status: "Missing",
        message: `${fieldKey} is not populated`,
      });
    }
  }

  // ── Out of Range checks ─────────────────────────────────────────────
  for (const field of ALL_SPEC_FIELDS) {
    if (!field.range) continue;
    const val = spec[field.key];
    if (val == null || val === "") continue;
    const num = Number(val);
    if (!Number.isFinite(num)) continue;
    if (num < field.range.min || num > field.range.max) {
      issues.push({
        field: field.key,
        severity: "Warning",
        status: "Needs Review",
        message: `${field.label} (${num}) is outside the expected range ${field.range.min}–${field.range.max}`,
      });
    }
  }

  // ── Warnings: low confidence on populated fields ───────────────────
  const confidence = spec.confidence;
  if (confidence === "C" || confidence === "D") {
    const populatedCount = COMPLETENESS_FIELDS.filter((f) => spec[f] != null && spec[f] !== "").length;
    if (populatedCount > 0) {
      issues.push({
        field: "confidence",
        severity: "Information",
        status: "Estimated",
        message: `Confidence is ${confidence} — populated fields should be verified against an official source before approval`,
      });
    }
  }

  // ── Warnings: populated fields without field_authority ──────────────
  for (const field of ALL_SPEC_FIELDS) {
    const val = spec[field.key];
    if (val == null || val === "") continue;
    const authority = spec.field_authority?.[field.key];
    if (!authority) {
      issues.push({
        field: field.key,
        severity: "Information",
        status: "Needs Review",
        message: `${field.label} has a value but no source authority recorded`,
      });
    }
  }

  // ── Completeness ───────────────────────────────────────────────────
  const populated = COMPLETENESS_FIELDS.filter((f) => spec[f] != null && spec[f] !== "").length;
  const completeness = Math.round((populated / COMPLETENESS_FIELDS.length) * 100);

  // ── Summary ────────────────────────────────────────────────────────
  const summary = {
    missing: issues.filter((i) => i.status === "Missing").length,
    outOfRange: issues.filter((i) => i.status === "Needs Review" && i.severity === "Warning").length,
    warnings: issues.filter((i) => i.severity === "Information").length,
    conflicts: 0, // No multi-source conflict detection in Stage 3
  };

  return { issues, completeness, summary };
}

/**
 * Classify a field's display status for colour coding in the Review screen.
 * @returns {string} "published" | "estimated" | "missing"
 */
export function fieldDisplayStatus(spec, fieldKey) {
  const val = spec?.[fieldKey];
  if (val == null || val === "") return "missing";
  const confidence = spec?.confidence;
  if (confidence === "A" || confidence === "B") return "published";
  return "estimated";
}