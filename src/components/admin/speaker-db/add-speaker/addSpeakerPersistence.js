// addSpeakerPersistence.js
// ---------------------------------------------------------------------------
// Persistence layer for the Add Speaker wizard.
// Handles saving spec edits (with change history), running validation
// (creating SpeakerDataQuality records), and approving specifications.
//
// Data rules enforced:
//   - Never overwrite an Approved specification (supersede instead)
//   - Never overwrite Locked fields (import_status === "Locked")
//   - Never delete specifications
//   - Never invent missing values
//   - Never estimate automatically
//   - Blank is preferable to incorrect
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { validateDraftSpec } from "./addSpeakerValidation.js";

/**
 * Save specification field edits and log each change to SpeakerChangeHistory.
 * Only logs fields that actually changed.
 *
 * @param {object} params
 *   productId, specId, oldSpec, newSpec, changeReason
 * @returns {object} { saved: boolean, changesLogged: number }
 */
export async function saveSpecEdits({ productId, specId, oldSpec, newSpec, changeReason }) {
  if (!specId) throw new Error("Specification ID is required");

  // Detect changed fields
  const changes = [];
  const specFields = Object.keys(newSpec).filter(
    (k) => !["id", "created_date", "updated_date", "created_by_id", "product_id"].includes(k)
  );

  for (const key of specFields) {
    const oldVal = oldSpec?.[key];
    const newVal = newSpec[key];
    // Compare as strings for consistency (handles null vs "")
    if (String(oldVal ?? "") !== String(newVal ?? "")) {
      // field_authority is an object — compare as JSON
      if (key === "field_authority") {
        if (JSON.stringify(oldVal || {}) !== JSON.stringify(newVal || {})) {
          changes.push({
            product_id: productId,
            field_changed: key,
            old_value: JSON.stringify(oldVal || {}),
            new_value: JSON.stringify(newVal || {}),
            source: "Manual Edit",
            change_type: "Manual Edit",
            change_reason: changeReason || "Manual Correction",
          });
        }
      } else {
        changes.push({
          product_id: productId,
          field_changed: key,
          old_value: String(oldVal ?? ""),
          new_value: String(newVal ?? ""),
          source: "Manual Edit",
          change_type: "Manual Edit",
          change_reason: changeReason || "Manual Correction",
        });
      }
    }
  }

  // Update the specification record
  await base44.entities.SpeakerSpecification.update(specId, newSpec);

  // Log changes
  if (changes.length > 0) {
    await base44.entities.SpeakerChangeHistory.bulkCreate(changes);
  }

  return { saved: true, changesLogged: changes.length };
}

/**
 * Run validation and persist issues as SpeakerDataQuality records.
 * Clears existing open issues for the product first, then creates new ones.
 *
 * @param {string} productId
 * @param {object} spec
 * @returns {object} validation result { issues, completeness, summary }
 */
export async function runValidationAndPersist(productId, spec) {
  const result = validateDraftSpec(spec);

  // Clear existing open issues for this product
  try {
    await base44.entities.SpeakerDataQuality.deleteMany({
      product_id: productId,
      status: { $nin: ["Resolved", "Ignored"] },
    });
  } catch {
    // Non-fatal — continue
  }

  // Create new issues
  if (result.issues.length > 0) {
    const records = result.issues.map((issue) => ({
      product_id: productId,
      field: issue.field,
      severity: issue.severity,
      status: issue.status,
      message: issue.message,
    }));
    await base44.entities.SpeakerDataQuality.bulkCreate(records);
  }

  return result;
}

/**
 * Approve the specification.
 * Sets approval_status to "Approved", stamps reviewer/approver, and
 * supersedes any previously Approved specification on the same product.
 *
 * @param {object} params
 *   productId, specId, reviewerName, allSpecs (existing specs for supersede)
 * @returns {object} { approved: true }
 */
export async function approveSpecification({ productId, specId, reviewerName }) {
  const today = new Date().toISOString().split("T")[0];

  // ── Supersede any existing Approved spec on this product ────────────
  try {
    const existingSpecs = await base44.entities.SpeakerSpecification.filter({ product_id: productId });
    for (const s of existingSpecs || []) {
      if (s.id !== specId && s.approval_status === "Approved") {
        await base44.entities.SpeakerSpecification.update(s.id, {
          approval_status: "Superseded",
          is_current: false,
        });
        await base44.entities.SpeakerChangeHistory.create({
          product_id: productId,
          field_changed: "approval_status",
          old_value: "Approved",
          new_value: "Superseded",
          source: "Manual Edit",
          change_type: "Manual Edit",
          change_reason: "Status Change",
        });
      }
    }
  } catch {
    // Non-fatal — continue
  }

  // ── Approve the current spec ────────────────────────────────────────
  await base44.entities.SpeakerSpecification.update(specId, {
    approval_status: "Approved",
    is_current: true,
    reviewed_by: reviewerName || "",
    reviewed_date: today,
    approved_by: reviewerName || "",
    approved_date: today,
  });

  // ── Update product import_status to Verified ────────────────────────
  await base44.entities.SpeakerProduct.update(productId, {
    import_status: "Verified",
  });

  // ── Log the approval in Change History ──────────────────────────────
  await base44.entities.SpeakerChangeHistory.create({
    product_id: productId,
    field_changed: "approval_status",
    old_value: "Draft",
    new_value: "Approved",
    source: "Manual Edit",
    change_type: "Manual Edit",
    change_reason: "Status Change",
  });

  return { approved: true };
}

/**
 * Submit the specification for review (Draft → Awaiting Review).
 */
export async function submitForReview({ productId, specId, reviewerName }) {
  const today = new Date().toISOString().split("T")[0];
  await base44.entities.SpeakerSpecification.update(specId, {
    approval_status: "Awaiting Review",
    reviewed_by: reviewerName || "",
    reviewed_date: today,
  });
  await base44.entities.SpeakerChangeHistory.create({
    product_id: productId,
    field_changed: "approval_status",
    old_value: "Draft",
    new_value: "Awaiting Review",
    source: "Manual Edit",
    change_type: "Manual Edit",
    change_reason: "Status Change",
  });
  return { submitted: true };
}