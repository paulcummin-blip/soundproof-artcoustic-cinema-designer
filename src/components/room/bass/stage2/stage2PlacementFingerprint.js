// stage2PlacementFingerprint.js
// P14-independent placement fingerprint and P14-dependent confirmation
// fingerprint for Stage 2 subwoofer placement evaluation.
//
// The placement fingerprint identifies the P14-independent raw transfer
// authority: room geometry, finalists, subwoofer model, acoustic-centre Z.
// Changing P14 does NOT invalidate this fingerprint — the raw modal transfer
// is identical regardless of the selected P14 target.
//
// The confirmation fingerprint extends the placement fingerprint with the
// selected P14 target identity. Changing P14 invalidates ONLY the confirmation
// layer; the placement/raw transfer cache remains valid and is reused.

import {
  STAGE2_CACHE_VERSION,
  STAGE2_RANKING_VERSION,
  STAGE2_CANONICAL_VERSION,
  STAGE2_PRODUCT_ENGINEERING_VERSION,
  STAGE2_PLACEMENT_VERSION,
} from "./stage2Constants";
import { BASS_RESULT_SCHEMA_VERSION } from "../bassOptimiserWorkerProtocol";
import { RP22_BASS_METRIC_SCHEMA_VERSION } from "../../../../../base44/shared/bassAuthorityVersion.js";
import { normaliseModelKey } from "@/components/models/speakers/registry";

// NOTE: p18TargetBasis (Minimum/Recommended) is a PRESENTATION-ONLY grading
// view. The achieved P18 extension Hz is identical regardless of which
// grading threshold set is applied. Therefore p18TargetBasis is NOT included
// in either fingerprint. The confirmed contract carries the achieved Hz;
// presentation grades it against Min/Rec thresholds at display time.

function stable(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function hash64(text) {
  const hash = (seed) => {
    let value = seed;
    for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
    return (value >>> 0).toString(16).padStart(8, "0");
  };
  return hash(0x811c9dc5) + hash(0x40007a67);
}

function buildFinalistIdentity(stage1Finalists) {
  const finalistIdentity = {};
  for (const qty of [1, 2, 4]) {
    const finalists = stage1Finalists?.[qty] || [];
    finalistIdentity[qty] = finalists
      .map((f) => ({ id: f?.id, family: f?.familyId }))
      .sort((a, b) => (a.id || "").localeCompare(b.id || ""));
  }
  return finalistIdentity;
}

/**
 * Compute the P14-INDEPENDENT placement fingerprint.
 *
 * Includes only inputs that affect the physical raw transfer:
 *   - Stage 1 fingerprint (room geometry, seats, RSP, source positions)
 *   - Finalist identities (which placements are being evaluated)
 *   - Selected subwoofer model (drives acoustic-centre Z via cabinet height)
 *   - Subwoofer bottom height (drives acoustic-centre Z)
 *
 * Excludes: P14 target (basis, level, dB), P18 basis, EQ constraints.
 *
 * Changing P14 does NOT change this fingerprint. The raw modal transfer
 * cached under this fingerprint is reused across all P14 targets.
 */
export function computeStage2PlacementFingerprint({
  stage1Fingerprint,
  stage1Finalists,
  selectedSubModel,
  subwooferBottomHeightM,
  amplifierPowerPerSubW,
}) {
  if (!stage1Fingerprint) return null;
  if (!selectedSubModel) return null;

  // Physics-only: includes only inputs that affect the raw modal transfer.
  // EQ/canonical/product-engineering versions are NOT here — they are
  // confirmation-layer concerns. An EQ-only change must NOT invalidate
  // the placement cache; a physics/source-model change MUST.
  //
  // amplifierPowerPerSubW is included because Stage 2 raw transfers include
  // sourceAmplifierDeratingDb (applied when rewSourceCurveMode === "product",
  // which Stage 2 always uses). A power change alters the derating and thus
  // the transfer — it must invalidate the placement cache. The RESOLVED
  // effective value is used (after defaults), so explicit-default and
  // implicit-default values resolving to the same effective power produce
  // the same identity.
  const canonical = {
    cacheVersion: STAGE2_CACHE_VERSION,
    placementVersion: STAGE2_PLACEMENT_VERSION,
    stage1Fingerprint,
    finalistIdentity: buildFinalistIdentity(stage1Finalists),
    selectedSubModel: normaliseModelKey(selectedSubModel),
    subwooferBottomHeightM: (subwooferBottomHeightM != null && Number.isFinite(Number(subwooferBottomHeightM)))
      ? Math.round(Number(subwooferBottomHeightM) * 1000) / 1000
      : "default",
    amplifierPowerPerSubW: Number.isFinite(Number(amplifierPowerPerSubW))
      ? Math.round(Number(amplifierPowerPerSubW) * 100) / 100
      : "default",
  };

  return `stage2-place:v3:${hash64(stable(canonical))}`;
}

/**
 * Compute the P14-DEPENDENT confirmation fingerprint.
 *
 * Extends the placement fingerprint with:
 *   - P14 target (basis, level, dB)
 *   - P18 basis
 *   - Result/metric schema versions
 *
 * Changing P14 invalidates ONLY this fingerprint. The placement fingerprint
 * (and its cached raw transfer) remains valid.
 */
export function computeStage2ConfirmationFingerprint({
  placementFingerprint,
  p14TargetBasis,
  p14TargetLevel,
  p14TargetDb,
}) {
  if (!placementFingerprint) return null;
  if (!p14TargetBasis || !Number.isFinite(p14TargetLevel)) return null;
  if (!Number.isFinite(p14TargetDb)) return null;

  // Confirmation-layer: placement fingerprint + P14 target + EQ/canonical/
  // product-engineering versions + result/metric schema versions.
  // p18TargetBasis is NOT here — it is a presentation-only grading view.
  const canonical = {
    placementFingerprint,
    rankingVersion: STAGE2_RANKING_VERSION,
    canonicalVersion: STAGE2_CANONICAL_VERSION,
    productEngineeringVersion: STAGE2_PRODUCT_ENGINEERING_VERSION,
    p14TargetBasis,
    p14TargetLevel: Math.round(p14TargetLevel),
    p14TargetDb: Math.round(p14TargetDb * 100) / 100,
    resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
  };

  return `stage2-confirm:v2:${hash64(stable(canonical))}`;
}