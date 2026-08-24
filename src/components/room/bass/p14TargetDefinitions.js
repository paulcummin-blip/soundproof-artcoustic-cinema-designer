// p14TargetDefinitions.js — P14 target combination definitions and base design fingerprint.
//
// Defines the 8 P14 target combinations (minimum/recommended × L1–L4) and
// computes the base design fingerprint that identifies the underlying bass
// design independent of P14 target selection.
//
// This module is PURE and SIDE-EFFECT FREE. It does NOT:
//   - Change bass physics, optimiser maths, EQ behaviour, or product capability.
//   - Start any background work.
//   - Modify the production UI.

import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { computeCalibrationFingerprint } from "./bassAnalysisFingerprints";
import { BASS_RESULT_SCHEMA_VERSION } from "./bassOptimiserWorkerProtocol";

export const P14_TARGET_BASES = ["minimum", "recommended"];
export const P14_TARGET_LEVELS = [1, 2, 3, 4];

/**
 * Build a stable cache key for a P14 target combination.
 * e.g. ("minimum", 2) -> "minimum-L2"
 */
export function buildP14TargetKey(basis, level) {
  return `${basis}-L${level}`;
}

/**
 * Build all 8 P14 target combinations with their derived dB values.
 * Uses the same deriveRequestedCalibrationConfig as the foreground path
 * so target dB values are always consistent with the live system.
 *
 * P18 grading basis is deliberately fixed to Minimum inside cached worker
 * contracts. It is presentation-only and is recomputed from achieved extension
 * whenever the user changes the P18 Minimum/Recommended view.
 *
 * @returns {Array<{basis, level, db, key, p14RequiredExtensionHz, p18TargetBasis, p18RequiredExtensionHz}>}
 */
export function buildP14TargetCombinations() {
  const combinations = [];
  for (const basis of P14_TARGET_BASES) {
    for (const level of P14_TARGET_LEVELS) {
      const config = deriveRequestedCalibrationConfig({
        splConfig: {
          selectedP14TargetBasis: basis,
          selectedP14Level: level,
          selectedP18TargetBasis: "minimum",
        },
        optimisationTransitionHz: 120,
        designEqSystemLimits: {},
      });
      combinations.push({
        basis,
        level,
        db: config.selectedP14TargetDb,
        key: buildP14TargetKey(basis, level),
        p14RequiredExtensionHz: config.selectedP14RequiredExtensionHz,
        p18TargetBasis: config.p18TargetBasis,
        p18RequiredExtensionHz: config.selectedP18RequiredExtensionHz,
      });
    }
  }
  return combinations;
}

/**
 * Compute the base design fingerprint: the calibration fingerprint with P14
 * target identity stripped. All 8 P14 target combinations for the same
 * underlying design share this fingerprint. A change to any bass-relevant
 * design input (room, seats, subs, RSP, acoustic/EQ constraints, etc.) produces
 * a different base design fingerprint, invalidating the entire target cache.
 *
 * @param {object} fingerprintInputs - The same inputs passed to computeCalibrationFingerprint
 * @returns {string|null} - The base design fingerprint, or null if inputs are missing
 */
export function computeBaseDesignFingerprint(fingerprintInputs) {
  if (!fingerprintInputs) return null;
  const inputs = {
    ...fingerprintInputs,
    // Strip P14 target identity so all 8 targets share the same base fingerprint
    selectedP14TargetDb: null,
    p14TargetBasis: null,
    p14TargetLevel: null,
    // P18 basis is a display/grading choice, not an acoustic design input.
    p18TargetBasis: null,
    selectedP18RequiredExtensionHz: null,
  };
  // Incorporate the result-schema revision so a calculated-result algorithm
  // change (e.g. the realistic post-calibration predictor) invalidates the
  // entire target cache. Without this, old target cache entries would survive
  // a result-schema bump (the calibration fingerprint is algorithm-independent),
  // block the foreground worker via the cache-hit path, then fail promotion
  // because their job.resultFingerprint carries the old result-schema version.
  return `${computeCalibrationFingerprint(inputs)}|rs:${BASS_RESULT_SCHEMA_VERSION}`;
}