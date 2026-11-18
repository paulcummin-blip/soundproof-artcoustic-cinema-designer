// authoritativeElectronicsMatch.js
// ---------------------------------------------------------------------------
// Production predicate: has the shared authoritative bass context ingested the
// CURRENT live electronic settings (subwoofer instances + crossover)?
//
// This replaces the raw-vs-effective comparison bug. The authoritative context
// stores EFFECTIVE sources — raw per-instance delay plus the auto time-alignment
// delay the bass engine derives from geometry (buildAuthoritativeAutoAlignDelays),
// and a crossover NORMALISED against the selected LCR models' limits
// (normaliseCrossoverConfig). Comparing RAW live instance delay/gain directly
// to those effective sources fails whenever autoAlignEnabled is true (the
// default): an ordinary raw delay of 0 becomes a nonzero effective delay, so a
// restored-baseline Retry was incorrectly refused as "unsettled".
//
// The fix reuses the EXISTING authoritative derivation unchanged — it does NOT
// copy or alter the alignment/calibration maths. It derives the expected CURRENT
// effective sources and normalised crossover from the canonical live
// instances/settings using the same functions the bass hook uses, then compares
// them to the authoritative context's stored effective sources/crossover via
// recommendationSettingsMatch. A match proves the authoritative context has
// caught up to the live settings; a mismatch means it is lagging and must not be
// reused.
//
// Pure: no React, no entity access, no acoustic calculation. Importable under
// bare Node for tests.
// ---------------------------------------------------------------------------

import { bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";
import {
  buildAuthoritativeAutoAlignDelays,
  buildAuthoritativeBassSources,
} from "@/components/room/bass/useAuthoritativeBassResponse";
import { buildAuthoritativeRspPosition } from "@/components/room/bass/authoritativeRspPosition";
import { buildLcrIntegrationSources } from "@/components/room/bass/lcrIntegrationSources";
import {
  resolveSharedCrossoverLimits,
  normaliseCrossoverConfig,
  DEFAULT_MODEL_CROSSOVER_LIMITS,
} from "@/components/room/bass/crossoverAuthority";
import { recommendationSettingsMatch } from "@/components/room/bass/optimiseWorkflow/crossoverApplicationVerification";
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";

/**
 * Resolve the designated RSP seat from seatingPositions, mirroring the hook.
 * Returns {id,x,y,z} or null.
 */
function resolveDesignatedRspSeat(seatingPositions, designatedRspSeatId) {
  if (!designatedRspSeatId) return null;
  const seat = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .find((s) => s?.id === designatedRspSeatId);
  if (!seat) return null;
  const x = Number(seat.x);
  const y = Number(seat.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { id: seat.id, x, y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 };
}

/**
 * Derive the expected CURRENT effective bass sources and normalised crossover
 * from the canonical live electronic settings, reusing the same authoritative
 * derivation the bass hook uses. Returns { crossover, tuning } or null when the
 * live settings are insufficient to derive.
 */
export function deriveExpectedEffectiveElectronics(live) {
  if (!live) return null;
  const instances = live.subwooferInstances;
  if (!Array.isArray(instances)) return null;
  const appState = live.appState || {};
  const splConfig = appState.splConfig || {};

  // Adapt raw instances to the bass-engine flat form (legacyGroup, centreZ,
  // orientation, defaults) — the same adapter the hydration path uses.
  const orientationMeta = {
    frontOrientation: live.frontSubsCfg?.orientation ?? null,
    rearOrientation: live.rearSubsCfg?.orientation ?? null,
  };
  const enabled = instances.filter((i) => i && i.enabled !== false);
  const adapted = bassInputAdapter(enabled, orientationMeta);
  const frontSubsLive = adapted.filter((s) => s.group === "front");
  const rearSubsLive = adapted.filter((s) => s.group === "rear");

  // RSP position — same canonical resolver as the hook.
  const rspPosition = buildAuthoritativeRspPosition(
    live.roomDims,
    appState.mlpY_m,
    appState.mlpX_m,
    resolveDesignatedRspSeat(live.seatingPositions, appState.designatedRspSeatId ?? null),
  );

  // autoAlignEnabled defaults to true (legacy designs without an explicit value).
  const autoAlignEnabled = splConfig.autoAlignEnabled !== undefined
    ? splConfig.autoAlignEnabled === true
    : true;

  const amplifierPowerPerSubW = Number.isFinite(Number(splConfig.subwooferAmplifierPowerW))
    ? Number(splConfig.subwooferAmplifierPowerW)
    : (Number.isFinite(Number(live.amplifierPowerPerSubW))
      ? Number(live.amplifierPowerPerSubW)
      : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W);

  const frontSubsCfg = live.frontSubsCfg;
  const rearSubsCfg = live.rearSubsCfg;

  // Auto time-alignment + effective sources — the SAME functions the hook uses,
  // unchanged. This is where raw delay 0 becomes the effective nonzero delay.
  const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
    enabled: autoAlignEnabled,
    rspPosition,
    frontSubsLive,
    rearSubsLive,
    frontSubsCfg,
    rearSubsCfg,
  });
  const effectiveSources = buildAuthoritativeBassSources({
    frontSubsLive,
    rearSubsLive,
    frontSubsCfg,
    rearSubsCfg,
    autoAlignDelays,
    amplifierPowerPerSubW,
  });

  // Normalised crossover against the CURRENT LCR model limits — the same
  // normalisation the hook applies. A raw crossover below a model's minimum is
  // raised, so comparing raw vs normalised would falsely mismatch.
  const lcrSources = buildLcrIntegrationSources(appState?.speakerSystem?.placedSpeakers);
  const crossoverLimits = lcrSources.length
    ? resolveSharedCrossoverLimits(lcrSources.map((source) => source.modelKey))
    : { ...DEFAULT_MODEL_CROSSOVER_LIMITS };
  const normalisedCrossover = normaliseCrossoverConfig(splConfig.crossover, crossoverLimits);

  const tuning = effectiveSources.map((source) => ({
    sourceId: source.id,
    delayMs: source.tuning?.delayMs,
    gainDb: source.tuning?.gainDb,
    phaseControlDeg: source.tuning?.phaseControlDeg,
    polarity: source.tuning?.polarity,
  }));

  return { crossover: normalisedCrossover, tuning };
}

/**
 * Returns true when the shared authoritative bass context has ingested the
 * CURRENT live electronic settings — i.e. its stored effective sources/crossover
 * match the expected effective sources/crossover derived from the canonical
 * live instances/settings. The authoritative context is the hook return on
 * `state.authoritative` (sources, crossover). The live settings are the
 * `liveElectronicRef.current` snapshot.
 *
 * @param {{authoritative?:object}} state - sharedRef.current (holds .authoritative)
 * @param {object} live - liveElectronicRef.current snapshot
 * @returns {boolean}
 */
export function authoritativeElectronicsMatchLive(state, live) {
  if (!state?.authoritative || !live) return false;
  const expected = deriveExpectedEffectiveElectronics(live);
  if (!expected) return false;
  return recommendationSettingsMatch(state.authoritative, expected);
}