/**
 * commercialHydrationAuthority.js
 * ------------------------------
 * The hydrate-and-dirty gate for a project's COMMERCIAL selections.
 *
 * The commercial state that decides a project's price — manual extras, the
 * accepted acoustic-treatment selection, the price-display basis — must never be
 * written to the database from an un-hydrated (default) state, and a populated
 * value must never be replaced by a temporary empty default because a render,
 * route change or report mount happened first.
 *
 * This module owns exactly two answers:
 *   (a) have the commercial collections for THIS project (and version) loaded?
 *   (b) does this outgoing payload collapse a loaded value without a real edit?
 *
 * It calculates nothing and holds no prices: pricing stays in
 * usePriceCalculation. It only decides whether a write is allowed and whether
 * the outgoing values are trustworthy.
 *
 * Rules:
 *   · A save is refused while hydration is incomplete (delayed hydration).
 *   · A populated commercial value may not collapse to a default unless a
 *     genuine user edit recorded that this collection was edited.
 *   · A genuinely empty project stays valid — an empty loaded value is
 *     authoritative and never "restored" into old data.
 */

// Relative import (not the @/ alias) so this module — and its regression test —
// can be loaded directly by the project's node test runner.
import { resolveAbfuserQuantityFromProject } from "../utils/abfuserQuantityMigration";

export const COMMERCIAL_COLLECTION = Object.freeze({
  MANUAL_EXTRAS: "manualExtras",
  ACOUSTIC_TREATMENT: "acousticTreatment",
  PRICE_BASIS: "priceBasis",
});

export const COMMERCIAL_BLOCK_REASON = Object.freeze({
  HYDRATION_INCOMPLETE: "COMMERCIAL_HYDRATION_INCOMPLETE",
  DEFAULT_WIPE: "COMMERCIAL_DEFAULT_WIPE",
});

export const PRICE_MODE = Object.freeze({
  INC_VAT: "incVat",
  EX_VAT: "exVat",
});

const DEFAULT_DIFFICULTY_MULTIPLIER = 1;

function parseMaybe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string" && value.trim()) {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function asArray(value) {
  const parsed = parseMaybe(value);
  return Array.isArray(parsed) ? parsed : [];
}

/** Manual extras are stored verbatim — every row a designer typed is kept. */
export function normaliseManualExtras(raw) {
  return asArray(raw).filter((row) => row && typeof row === "object");
}

function normalisePriceMode(raw) {
  return raw === PRICE_MODE.EX_VAT ? PRICE_MODE.EX_VAT : PRICE_MODE.INC_VAT;
}

function normaliseDifficultyMultiplier(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DIFFICULTY_MULTIPLIER;
}

/**
 * The authoritative commercial values of a loaded project / version record.
 * Used by BOTH hydration and the autosave baseline so the two can never
 * disagree about what "unchanged" means.
 *
 * @param {Object} project - merged project + version (design_state spread in)
 */
export function normaliseCommercialSelections(project) {
  const treatment = resolveAbfuserQuantityFromProject(project);
  return {
    manualExtras: normaliseManualExtras(project?.manual_extras),
    priceMode: normalisePriceMode(project?.price_mode),
    // Display basis: shown by default (matches the existing UI default).
    showPrices: project?.show_prices !== false,
    difficultyMultiplier: normaliseDifficultyMultiplier(project?.difficulty_multiplier),
    acousticTreatment: {
      enabled: project?.acoustic_treatment_enabled === true,
      selectedQuantity: treatment.selectedQuantity,
      quantitySource: treatment.quantitySource,
      legacyAutoQuantity: treatment.legacyAutoQuantity,
      migrated: treatment.migrated,
    },
    // Read-only: the selected products themselves are owned by the speaker
    // store; recorded here only so a save can be described in the audit log.
    selectedProductCount: asArray(project?.selected_speakers).length,
  };
}

// ── Edit registry ────────────────────────────────────────────────────────
// Commercial setters record a real designer edit here. The registry is cleared
// when a project finishes loading, so the guard can tell a genuine edit apart
// from a default value that appeared because something has not loaded yet.
let commercialEdits = {};
// The authority currently in force. Edits are only recorded once a project's
// commercial collections have finished loading — a setter firing during
// hydration is the loaded record being applied, not a designer action.
let activeCommercialAuthority = null;

export function setActiveCommercialAuthority(authority) {
  activeCommercialAuthority = authority || null;
}

export function recordCommercialEdit(collection) {
  if (!collection) return;
  if (!activeCommercialAuthority || activeCommercialAuthority.status !== "loaded") return;
  commercialEdits = { ...commercialEdits, [collection]: true };
}

export function readCommercialEdits() {
  return { ...commercialEdits };
}

export function clearCommercialEdits() {
  commercialEdits = {};
}

// ── Hydration authority ──────────────────────────────────────────────────

export function createCommercialAuthority({ projectId, versionId, loadGenerationId } = {}) {
  return {
    projectId: projectId || null,
    versionId: versionId || null,
    loadGenerationId: Number.isFinite(Number(loadGenerationId)) ? Number(loadGenerationId) : null,
    status: "loading",
    snapshot: null,
  };
}

/** Mark the commercial collections as loaded for this project + version. */
export function markCommercialHydrated(authority, snapshot) {
  if (!authority) return null;
  return { ...authority, status: "loaded", snapshot: snapshot || null };
}

export function markCommercialError(authority) {
  if (!authority) return null;
  return { ...authority, status: "error" };
}

/**
 * TRUE only when the commercial collections of this exact project + version
 * have finished loading.
 */
export function isCommercialHydrationComplete(authority, projectId, versionId) {
  if (!authority) return false;
  if (!projectId) return false;
  if (authority.status !== "loaded") return false;
  if (authority.projectId !== projectId) return false;
  const expectedVersion = versionId || null;
  return (authority.versionId || null) === expectedVersion;
}

function collapseDetected(loaded, outgoing, edits) {
  const collapsed = [];

  // Manual extras: a populated list must not become empty without an edit.
  if (Array.isArray(outgoing?.manual_extras) && loaded?.manualExtras?.length > 0
    && outgoing.manual_extras.length === 0 && edits[COMMERCIAL_COLLECTION.MANUAL_EXTRAS] !== true) {
    collapsed.push(`manualExtras ${loaded.manualExtras.length}→0`);
  }

  // Acoustic treatment: an accepted selection must not be silently disabled or
  // zeroed. A designer toggle/edit is recorded, so a real removal still saves.
  const treatment = loaded?.acousticTreatment || {};
  if (treatment.enabled === true && edits[COMMERCIAL_COLLECTION.ACOUSTIC_TREATMENT] !== true) {
    if (outgoing?.acoustic_treatment_enabled === false) {
      collapsed.push("acousticTreatment enabled→disabled");
    } else if (treatment.selectedQuantity > 0 && Number(outgoing?.selected_abfuser_qty) === 0) {
      collapsed.push(`treatmentQty ${treatment.selectedQuantity}→0`);
    }
  }

  return collapsed;
}

/**
 * Decide whether an outgoing payload may be written.
 *
 * @param {Object} params
 * @param {Object} params.authority - commercial authority for the active project
 * @param {string} params.projectId
 * @param {string|null} params.versionId
 * @param {Object} params.outgoing - serialized payload about to be written
 * @returns {{allowed:boolean, blocked:boolean, reason:string|null, detail:string|null}}
 */
export function guardCommercialSave({ authority, projectId, versionId, outgoing } = {}) {
  if (!isCommercialHydrationComplete(authority, projectId, versionId)) {
    return {
      allowed: false,
      blocked: true,
      reason: COMMERCIAL_BLOCK_REASON.HYDRATION_INCOMPLETE,
      detail: "Commercial selections have not finished loading for this project version.",
    };
  }

  const edits = readCommercialEdits();
  const collapsed = collapseDetected(authority.snapshot, outgoing, edits);
  if (collapsed.length > 0) {
    return {
      allowed: false,
      blocked: true,
      reason: COMMERCIAL_BLOCK_REASON.DEFAULT_WIPE,
      detail: collapsed.join(", "),
    };
  }

  return { allowed: true, blocked: false, reason: null, detail: null };
}

/** Compact description of a payload's commercial values, for the audit log. */
export function summariseCommercialSelections(outgoing) {
  return {
    manualExtras: Array.isArray(outgoing?.manual_extras) ? outgoing.manual_extras.length : 0,
    treatmentEnabled: outgoing?.acoustic_treatment_enabled === true,
    treatmentQty: Number(outgoing?.selected_abfuser_qty) || 0,
    treatmentSource: outgoing?.abfuser_qty_source || "none",
    priceMode: outgoing?.price_mode || null,
    showPrices: outgoing?.show_prices !== false,
  };
}