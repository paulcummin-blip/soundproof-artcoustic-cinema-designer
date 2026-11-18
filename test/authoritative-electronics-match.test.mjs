import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authoritativeElectronicsMatchLive,
  deriveExpectedEffectiveElectronics,
} from "../src/components/room/bass/optimiseWorkflow/authoritativeElectronicsMatch.js";
import { bassInputAdapter } from "../src/components/utils/subwooferInstanceMigration.js";
import {
  buildAuthoritativeAutoAlignDelays,
  buildAuthoritativeBassSources,
} from "../src/components/room/bass/useAuthoritativeBassResponse.js";
import { buildAuthoritativeRspPosition } from "../src/components/room/bass/authoritativeRspPosition.js";
import {
  resolveSharedCrossoverLimits,
  normaliseCrossoverConfig,
  DEFAULT_MODEL_CROSSOVER_LIMITS,
} from "../src/components/room/bass/crossoverAuthority.js";
import { buildLcrIntegrationSources } from "../src/components/room/bass/lcrIntegrationSources.js";

// ---------------------------------------------------------------------------
// Shared fixtures — a realistic two-sub (one front, one rear) design with the
// DEFAULT autoAlignEnabled=true. The RSP sits closer to the front sub, so the
// rear sub's effective delay is nonzero even though the raw delay is 0.
// ---------------------------------------------------------------------------
const roomDims = { widthM: 4.64, lengthM: 5.09, heightM: 2.6 };
const rspPosition = buildAuthoritativeRspPosition(roomDims, 3.48, null, null);
const crossoverLimits = { ...DEFAULT_MODEL_CROSSOVER_LIMITS };
const storedCrossover = { frequencyHz: 100, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 100 };

function rawInstances({ frontDelay = 0, rearDelay = 0, frontGain = 0, rearGain = 0, frontPolarity = 1, rearPolarity = 1 } = {}) {
  return [
    { id: "sub-front-1", model: "sub3-12", legacyGroup: "front", enabled: true, position: { x: 0.31, y: 0.1375 }, bottomHeightM: 0.05, rotationDeg: 0, delayMs: frontDelay, gainDb: frontGain, polarity: frontPolarity, phaseControlDeg: 0 },
    { id: "sub-rear-1", model: "sub3-12", legacyGroup: "rear", enabled: true, position: { x: 0.31, y: 4.9525 }, bottomHeightM: 0.05, rotationDeg: 180, delayMs: rearDelay, gainDb: rearGain, polarity: rearPolarity, phaseControlDeg: 0 },
  ];
}

function orientationMeta(instances) {
  return { frontOrientation: null, rearOrientation: null };
}

// Reuse the EXACT authoritative derivation to build the authoritative context's
// stored sources/crossover — what the bass hook would produce for a given set
// of live instances. This is the "ingested" authoritative state. When
// placedSpeakers is supplied the crossover is normalised against the derived
// LCR limits, exactly as the hook does.
function buildAuthoritativeContext(instances, { autoAlignEnabled = true, crossover = storedCrossover, amplifierPowerPerSubW = 1000, placedSpeakers = [] } = {}) {
  const enabled = instances.filter((i) => i && i.enabled !== false);
  const adapted = bassInputAdapter(enabled, orientationMeta());
  const frontSubsLive = adapted.filter((s) => s.group === "front");
  const rearSubsLive = adapted.filter((s) => s.group === "rear");
  const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
    enabled: autoAlignEnabled, rspPosition, frontSubsLive, rearSubsLive, frontSubsCfg: null, rearSubsCfg: null,
  });
  const sources = buildAuthoritativeBassSources({
    frontSubsLive, rearSubsLive, frontSubsCfg: null, rearSubsCfg: null, autoAlignDelays, amplifierPowerPerSubW,
  });
  const lcrSources = buildLcrIntegrationSources(placedSpeakers);
  const limits = lcrSources.length
    ? resolveSharedCrossoverLimits(lcrSources.map((source) => source.modelKey))
    : { ...DEFAULT_MODEL_CROSSOVER_LIMITS };
  const normalisedCrossover = normaliseCrossoverConfig(crossover, limits);
  return { sources, crossover: normalisedCrossover };
}

function buildLive(instances, { autoAlignEnabled = true, crossover = storedCrossover, amplifierPowerPerSubW = 1000, appState = {} } = {}) {
  return {
    subwooferInstances: instances,
    frontSubsCfg: null,
    rearSubsCfg: null,
    roomDims,
    amplifierPowerPerSubW,
    seatingPositions: [],
    appState: {
      ...appState,
      mlpY_m: 3.48,
      mlpX_m: null,
      designatedRspSeatId: null,
      speakerSystem: { placedSpeakers: [] },
      splConfig: { crossover, autoAlignEnabled, subwooferAmplifierPowerW: amplifierPowerPerSubW },
    },
  };
}

test("ordinary default auto-align raw delay 0 -> effective nonzero is accepted (restored baseline)", () => {
  // Raw delay 0 on both subs, autoAlignEnabled=true (default). The authoritative
  // context ingested these same instances, so its effective sources carry the
  // nonzero auto-align delay. The OLD raw comparison refused this; the predicate
  // accepts it because it derives the same effective delay.
  const instances = rawInstances();
  const ctx = buildAuthoritativeContext(instances);
  const live = buildLive(instances);
  // Sanity: the rear sub's effective delay is genuinely nonzero.
  const rearSource = ctx.sources.find((s) => s.id === "sub-rear-1");
  assert.ok(Number.isFinite(rearSource.tuning.delayMs) && rearSource.tuning.delayMs > 0.001, "rear effective delay is nonzero");
  const state = { authoritative: ctx };
  assert.equal(authoritativeElectronicsMatchLive(state, live), true, "restored baseline with auto-align accepted");
});

test("v2-optimised absolute delay is preserved and accepted", () => {
  // A v2-optimised candidate carries an absolute effective delay. The
  // authoritative context ingested it; the predicate must accept the same live
  // instances (with tuningSource v2-optimised stamped) without re-adding
  // auto-align.
  const frontAbs = 3.0;
  const rearAbs = 3.9626910966908078;
  const instances = rawInstances({ frontDelay: frontAbs, rearDelay: rearAbs }).map((s) => ({ ...s, tuningSource: "v2-optimised" }));
  const ctx = buildAuthoritativeContext(instances);
  const live = buildLive(instances);
  const frontSource = ctx.sources.find((s) => s.id === "sub-front-1");
  const rearSource = ctx.sources.find((s) => s.id === "sub-rear-1");
  assert.ok(Math.abs(frontSource.tuning.delayMs - frontAbs) < 1e-6, "front absolute delay preserved");
  assert.ok(Math.abs(rearSource.tuning.delayMs - rearAbs) < 1e-6, "rear absolute delay preserved");
  const state = { authoritative: ctx };
  assert.equal(authoritativeElectronicsMatchLive(state, live), true, "v2-optimised absolute delay accepted");
});

test("legitimate normalised crossover is accepted (raw below model minimum)", () => {
  // LCR models with a 150 Hz minimum are selected. A raw 80 Hz crossover is
  // normalised up to 150 Hz by the hook. The authoritative context stores 150 Hz;
  // the live raw is 80 Hz. The OLD raw comparison refused; the predicate accepts
  // because it normalises the live crossover the same way.
  const evolveLimits = resolveSharedCrossoverLimits(["evolve-1"]);
  const instances = rawInstances();
  const live = buildLive(instances, { crossover: { ...storedCrossover, frequencyHz: 80, subwooferFrequencyHz: 80 } });
  live.appState.speakerSystem.placedSpeakers = [
    { role: "FL", model: "evolve-1", position: { x: 1, y: 0.1, z: 1.2 } },
    { role: "FC", model: "evolve-1", position: { x: 2.32, y: 0.1, z: 1.2 } },
    { role: "FR", model: "evolve-1", position: { x: 3.6, y: 0.1, z: 1.2 } },
  ];
  // Authoritative context: hook normalises the same raw 80 Hz against the same
  // evolve-1 limits -> 150 Hz.
  const evolveSpeakers = live.appState.speakerSystem.placedSpeakers;
  const ctx = buildAuthoritativeContext(instances, { crossover: { ...storedCrossover, frequencyHz: 80, subwooferFrequencyHz: 80 }, placedSpeakers: evolveSpeakers });
  // The predicate derives its own limits from placedSpeakers and normalises.
  // Override the fixture's limits to match the live LCR.
  const expected = deriveExpectedEffectiveElectronics(live);
  assert.equal(expected.crossover.frequencyHz, evolveLimits.minHz, "live raw 80 Hz normalised up to evolve-1 minimum");
  assert.equal(ctx.crossover.frequencyHz, evolveLimits.minHz, "authoritative crossover normalised to the same minimum");
  const state = { authoritative: ctx };
  assert.equal(authoritativeElectronicsMatchLive(state, live), true, "legitimate normalised crossover accepted");
});

test("lagging actual settings/sources are rejected", () => {
  // The authoritative context was ingested from an OLD set of instances (front
  // gain 0). The live instances now have front gain +3 dB. The authoritative
  // context has NOT re-derived yet (lagging). The predicate must refuse.
  const oldInstances = rawInstances({ frontGain: 0 });
  const liveInstances = rawInstances({ frontGain: 3 });
  const ctx = buildAuthoritativeContext(oldInstances); // ingested old
  const live = buildLive(liveInstances);
  const state = { authoritative: ctx };
  assert.equal(authoritativeElectronicsMatchLive(state, live), false, "lagging authoritative sources rejected");
});

test("lagging crossover is rejected", () => {
  // Authoritative context ingested a 100 Hz crossover; live settings now carry
  // 120 Hz. The authoritative context has not re-normalised yet. Refuse.
  const instances = rawInstances();
  const ctx = buildAuthoritativeContext(instances, { crossover: { ...storedCrossover, frequencyHz: 100 } });
  const live = buildLive(instances, { crossover: { ...storedCrossover, frequencyHz: 120, subwooferFrequencyHz: 120 } });
  const state = { authoritative: ctx };
  assert.equal(authoritativeElectronicsMatchLive(state, live), false, "lagging authoritative crossover rejected");
});

test("no auto-apply: the predicate never mutates state or live", () => {
  const instances = rawInstances();
  const ctx = buildAuthoritativeContext(instances);
  const live = buildLive(instances);
  const state = { authoritative: ctx };
  const liveBefore = JSON.parse(JSON.stringify(live));
  const stateBefore = JSON.parse(JSON.stringify(state));
  authoritativeElectronicsMatchLive(state, live);
  assert.deepEqual(live, liveBefore, "live snapshot unchanged");
  assert.deepEqual(state, stateBefore, "state unchanged");
});

test("missing authoritative or live returns false", () => {
  const instances = rawInstances();
  assert.equal(authoritativeElectronicsMatchLive(null, buildLive(instances)), false);
  assert.equal(authoritativeElectronicsMatchLive({ authoritative: null }, buildLive(instances)), false);
  assert.equal(authoritativeElectronicsMatchLive({ authoritative: buildAuthoritativeContext(instances) }, null), false);
});

test("disabled instances are excluded from the effective derivation", () => {
  // One front sub disabled. The authoritative context ingested only the rear
  // sub. The predicate derives the same single-source effective set -> match.
  const instances = rawInstances();
  instances[0].enabled = false;
  const enabledOnly = instances.filter((i) => i.enabled !== false);
  const ctx = buildAuthoritativeContext(enabledOnly);
  const live = buildLive(instances);
  const state = { authoritative: ctx };
  assert.equal(authoritativeElectronicsMatchLive(state, live), true, "disabled sub excluded, single-source match");
});