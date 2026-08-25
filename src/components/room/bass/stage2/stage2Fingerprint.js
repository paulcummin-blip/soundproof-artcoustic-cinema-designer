// stage2Fingerprint.js
// Stage 2 fingerprint: identifies the exact set of inputs that determine the
// Stage 2 canonical evaluation result. If any input changes, the entire
// Stage 2 result is invalidated and must be recalculated.
//
// Includes: Stage 1 fingerprint, finalist identities, selected subwoofer model,
// P14 target, canonical bass physics/result/metric versions, Stage 2 ranking
// and canonical versions.

import {
  STAGE2_CACHE_VERSION,
  STAGE2_RANKING_VERSION,
  STAGE2_CANONICAL_VERSION,
  STAGE2_PRODUCT_ENGINEERING_VERSION,
} from "./stage2Constants";
import { BASS_RESULT_SCHEMA_VERSION } from "../bassOptimiserWorkerProtocol";
import { RP22_BASS_METRIC_SCHEMA_VERSION } from "../../../../../base44/shared/bassAuthorityVersion.js";
import { normaliseModelKey } from "@/components/models/speakers/registry";

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

/**
 * Compute the Stage 2 placement fingerprint.
 *
 * @param {object} params
 * @param {string} params.stage1Fingerprint — Stage 1 geometry fingerprint
 * @param {object} params.stage1Finalists — { 1: [{id, familyId}], 2: [...], 4: [...] }
 * @param {string} params.selectedSubModel — normalised subwoofer model key
 * @param {string} params.p14TargetBasis — "minimum" | "recommended"
 * @param {number} params.p14TargetLevel — 1–4
 * @param {number} params.p14TargetDb — derived target dB
 * @param {string} params.p18TargetBasis — "minimum" | "recommended"
 * @param {number} [params.subwooferBottomHeightM] — project subwoofer bottom height (m).
 *   Drives acoustic-centre Z via deriveCentreZ; must invalidate when it changes.
 * @returns {string|null} fingerprint, or null if inputs are invalid
 */
export function computeStage2Fingerprint({
  stage1Fingerprint,
  stage1Finalists,
  selectedSubModel,
  p14TargetBasis,
  p14TargetLevel,
  p14TargetDb,
  p18TargetBasis,
  subwooferBottomHeightM,
}) {
  if (!stage1Fingerprint) return null;
  if (!selectedSubModel) return null;
  if (!p14TargetBasis || !Number.isFinite(p14TargetLevel)) return null;
  if (!Number.isFinite(p14TargetDb)) return null;

  const finalistIdentity = {};
  for (const qty of [1, 2, 4]) {
    const finalists = stage1Finalists?.[qty] || [];
    finalistIdentity[qty] = finalists
      .map((f) => ({ id: f?.id, family: f?.familyId }))
      .sort((a, b) => (a.id || "").localeCompare(b.id || ""));
  }

  const canonical = {
    cacheVersion: STAGE2_CACHE_VERSION,
    rankingVersion: STAGE2_RANKING_VERSION,
    canonicalVersion: STAGE2_CANONICAL_VERSION,
    stage1Fingerprint,
    finalistIdentity,
    selectedSubModel: normaliseModelKey(selectedSubModel),
    productEngineeringVersion: STAGE2_PRODUCT_ENGINEERING_VERSION,
    p14TargetBasis,
    p14TargetLevel: Math.round(p14TargetLevel),
    p14TargetDb: Math.round(p14TargetDb * 100) / 100,
    p18TargetBasis: p18TargetBasis || "minimum",
    // Acoustic-centre Z authority: bottomHeightM drives deriveCentreZ. If the
    // project subwoofer bottom height changes, the source Z changes and all
    // downstream P14/P18/P19/P20 results must be recalculated.
    subwooferBottomHeightM: (subwooferBottomHeightM != null && Number.isFinite(Number(subwooferBottomHeightM)))
      ? Math.round(Number(subwooferBottomHeightM) * 1000) / 1000
      : "default",
    resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
  };

  return `stage2:v1:${hash64(stable(canonical))}`;
}