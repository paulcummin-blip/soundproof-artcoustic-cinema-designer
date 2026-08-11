/**
 * bestPracticeAimingCandidates.js
 * --------------------------------
 * Stage E2 — best-practice speaker-aiming recommendations.
 *
 * Separate from MATERIAL UPGRADE: these do not require an RP22/RP23 level
 * gain, receive no invented ASDR points, and may leave the Design Rating
 * unchanged. They exist because the current design differs from established
 * acoustic best practice (RP22 recommends pointing speakers toward the
 * Reference Seating Position where possible).
 *
 * Aiming authority:
 *   - LCR effective yaw: lcrAimMode === "angled" → safeYawToMLP (toward RSP);
 *     lcrAimMode === "flat" → 0° (straight ahead). LCR yaw is exclusively
 *     lcrAimMode-driven (getPlanAimDeg returns lcrAngleInfo.L/R) — there is
 *     no separate manual-yaw path for LCR.
 *   - Surround effective yaw: resolveSpeakerYaw (the same authority used by
 *     P16/P17 via rp22HfOffAxis.js getEffectiveYawDeg and by the plan-view
 *     render path). This respects manual yaw, aim-at-MLP toggles, and
 *     role-based wall-flat defaults.
 *   - Required yaw toward RSP: safeYawToMLP (same convention as both above).
 *
 * Trivial-angle guard: 2° — the finest existing angular bucket in the
 * codebase (fwDeviationLevel L4 wide-speaker deviation threshold in
 * rvPlanHelpers.jsx). Below this, a yaw correction is not a meaningful
 * orientation change and would produce "Aim by 0.4°" noise.
 */

import { safeYawToMLP } from "@/components/room/rv/RenderPrimitives";
import { resolveSpeakerYaw } from "@/components/utils/speakerAimResolver";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

const AIM_TOLERANCE_DEG = 2;

function absDeltaDeg(a, b) {
  const d = Math.abs(Number(a) - Number(b));
  if (!Number.isFinite(d)) return Infinity;
  return d > 180 ? 360 - d : d;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function posOf(speaker) {
  const p = speaker?.position || speaker;
  if (!p || !isNum(p.x) || !isNum(p.y)) return null;
  return { x: Number(p.x), y: Number(p.y) };
}

const SIDE_SURROUND_RE = /^(SL|SR)(\d*)$/;
const REAR_SURROUND_ROLES = new Set(["SBL", "SBR"]);

function isListenerLevelSurround(canonRole) {
  return SIDE_SURROUND_RE.test(canonRole) || REAR_SURROUND_ROLES.has(canonRole);
}

/**
 * Build best-practice aiming candidates (max 2: FL/FR, then surrounds).
 * Returns candidates with kind "best-practice". Eligibility is determined
 * here — the evaluator only provides optional genuine-level-change display.
 */
export function buildBestPracticeAimingCandidates({
  placedSpeakers,
  mlpPoint,
  appState,
  seats,
  screen,
  dolbyLayout,
}) {
  if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return [];
  if (!mlpPoint || !isNum(mlpPoint.x) || !isNum(mlpPoint.y)) return [];

  const mlp = { x: Number(mlpPoint.x), y: Number(mlpPoint.y) };
  const lcrAimMode = appState?.lcrAimMode || "flat";
  const candidates = [];

  // ── Priority 1: FL/FR aiming ──
  const fl = placedSpeakers.find((s) => getCanonicalRole(s?.role) === "FL");
  const fr = placedSpeakers.find((s) => getCanonicalRole(s?.role) === "FR");
  const flPos = posOf(fl);
  const frPos = posOf(fr);

  let lcrMaxDelta = 0;
  let lcrSampleDeg = 0;
  for (const [spk, pos] of [[fl, flPos], [fr, frPos]]) {
    if (!pos) continue;
    const required = safeYawToMLP(pos, mlp);
    const effective = lcrAimMode === "angled" ? required : 0;
    const delta = absDeltaDeg(effective, required);
    if (delta > lcrMaxDelta) {
      lcrMaxDelta = delta;
      lcrSampleDeg = required;
    }
  }

  if (lcrMaxDelta >= AIM_TOLERANCE_DEG) {
    const inwardDeg = Math.round(Math.abs(lcrSampleDeg));
    const technicalLine = inwardDeg >= AIM_TOLERANCE_DEG
      ? `Aim approximately ${inwardDeg}° inward.`
      : null;
    candidates.push({
      id: "best-practice:aim-lcr-rsp",
      kind: "best-practice",
      recommendationClass: "BEST-PRACTICE IMPROVEMENT",
      title: "Aim the left and right speakers toward the RSP",
      description: "Improves direct sound, localisation and tonal consistency.",
      seats: Array.isArray(seats) ? seats : [],
      placedSpeakers,
      screen,
      dolbyLayout,
      mlpPoint: mlp,
      costDeltaExVat: null,
      disruption: "Low",
      confidence: "High",
      aimingOverride: { lcrAimMode: "angled" },
      applyAction: { type: "set-lcr-aim-mode", value: "angled" },
      amplifierUpgradeRequired: false,
      lcrPowerBeforeW: null,
      lcrPowerAfterW: null,
      caveat: lcrAimMode === "flat" ? "FL/FR currently fire straight ahead." : null,
      technicalLine,
    });
  }

  // ── Priority 2: Surround aiming (grouped into one card) ──
  const needsAiming = [];
  let needsSideAim = false;
  let needsRearAim = false;

  for (const speaker of placedSpeakers) {
    const canon = getCanonicalRole(speaker?.role);
    if (!isListenerLevelSurround(canon)) continue;
    const pos = posOf(speaker);
    if (!pos) continue;
    const required = safeYawToMLP(pos, mlp);
    const effective = resolveSpeakerYaw({
      speaker: { ...speaker, position: pos },
      mlpPos: mlp,
      appState,
      getCanonicalRole,
    });
    const delta = absDeltaDeg(effective, required);
    if (delta >= AIM_TOLERANCE_DEG) {
      needsAiming.push({ role: canon, delta });
      if (SIDE_SURROUND_RE.test(canon)) needsSideAim = true;
      if (REAR_SURROUND_ROLES.has(canon)) needsRearAim = true;
    }
  }

  if (needsAiming.length > 0) {
    const aimingOverride = {};
    if (needsSideAim) aimingOverride.aimSideSurroundsAtMLP = true;
    if (needsRearAim) aimingOverride.aimRearSurroundsAtMLP = true;

    const roles = needsAiming.map((n) => n.role);
    const detail = roles.length <= 2
      ? roles.join(", ")
      : `${roles.slice(0, 2).join(", ")} +${roles.length - 2} more`;

    candidates.push({
      id: "best-practice:aim-surrounds-rsp",
      kind: "best-practice",
      recommendationClass: "BEST-PRACTICE IMPROVEMENT",
      title: "Aim the surround speakers toward the listening area",
      description: "Reduces off-axis listening and improves tonal consistency.",
      seats: Array.isArray(seats) ? seats : [],
      placedSpeakers,
      screen,
      dolbyLayout,
      mlpPoint: mlp,
      costDeltaExVat: null,
      disruption: "Low",
      confidence: "High",
      aimingOverride,
      applyAction: { type: "set-aim-toggles", values: aimingOverride },
      amplifierUpgradeRequired: false,
      lcrPowerBeforeW: null,
      lcrPowerAfterW: null,
      caveat: `Affected: ${detail}`,
    });
  }

  return candidates;
}