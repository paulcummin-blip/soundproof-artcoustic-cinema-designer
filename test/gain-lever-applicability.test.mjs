// gain-lever-applicability.test.mjs
// ---------------------------------------------------------------------------
// Marquee Home: 4 x SUB3-12, two front (y = 0.14) and two rear (y = 7.15) in a
// 5.18 x 7.29 x 2.4 m room. Grouped gain is a valid lever for that layout, so
// the run must never publish "Gain analysed (not applicable)" for it, and a
// gain search that found no improvement must be reported as tested.
//
// These tests read the real modules and the engine source. Nothing here
// recalculates acoustics: grouping, candidate generation and the presentation
// contract are asserted exactly as the product uses them.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defineGainGroups,
  generateGroupedGainCoarseCandidates,
  planGroupedGainRefinement,
} from '../src/components/room/bass/improveBassV2/groupedGainSearch.js';
import { buildStageDisplay } from '../src/components/room/bass/improveBassV2/improveBassV2StageMapping.js';
import {
  OPTIMISER_RUN_FAMILY,
  OPTIMISER_FAMILY_STATUS,
  buildFamilyLedger,
} from '../src/components/room/bass/optimiserPlan/optimiserRunFamilies.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

/** Marquee Home's real room and subwoofer geometry. */
const MARQUEE_ROOM = { widthM: 5.18, lengthM: 7.29, heightM: 2.4 };
const MARQUEE_SUBS = [
  { id: 'sub-front-1', enabled: true, position: { x: 1.29, y: 0.14 }, legacyGroup: 'front' },
  { id: 'sub-front-2', enabled: true, position: { x: 3.88, y: 0.14 }, legacyGroup: 'front' },
  { id: 'sub-rear-1', enabled: true, position: { x: 1.29, y: 7.15 }, legacyGroup: 'rear' },
  { id: 'sub-rear-2', enabled: true, position: { x: 3.88, y: 7.15 }, legacyGroup: 'rear' },
];

const marqueeBaseline = () => MARQUEE_SUBS.map((sub) => ({
  sourceId: sub.id, delayMs: 0, gainDb: 0, polarity: 1,
}));

const gainFamilyOf = (ledger) => ledger.find((entry) => entry.family === OPTIMISER_RUN_FAMILY.GAIN);

describe('grouped gain applicability — Marquee Home', () => {
  it('recognises the four-sub front/rear layout as gain-adjustable', () => {
    const grouping = defineGainGroups(MARQUEE_SUBS, MARQUEE_ROOM);
    expect(grouping.status).toBe('eligible');
    expect(grouping.groups.map((group) => group.label)).toEqual(['Front pair', 'Rear pair']);
    expect(grouping.groups[0].sourceIds).toEqual(['sub-front-1', 'sub-front-2']);
    expect(grouping.groups[1].sourceIds).toEqual(['sub-rear-1', 'sub-rear-2']);
  });

  it('generates relative gain candidates for both groups', () => {
    const grouping = defineGainGroups(MARQUEE_SUBS, MARQUEE_ROOM);
    const rows = generateGroupedGainCoarseCandidates(grouping, marqueeBaseline());
    // The frozen Current control leads, then a trim sweep for each of the two groups.
    expect(rows[0].id).toBe('current');
    expect(rows[0].isCurrent).toBe(true);
    const neutral = rows.filter((row) => row.adjustmentDb === 0);
    expect(neutral.every((row) => row.tuning.every((tuning) => tuning.gainDb === 0))).toBe(true);
    for (const direction of ['A', 'B']) {
      const trims = rows.filter((row) => row.direction === direction && row.adjustmentDb !== 0);
      // The mandated sweep: every 0.5 dB step from 0 down to −6 dB, for each
      // group in turn. Trimming one group while the other is frozen spans the
      // full ±6 dB relative balance range in both directions.
      expect(trims.map((row) => row.adjustmentDb))
        .toEqual([-6, -5.5, -5, -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5]);
      // Each candidate moves only its own group, and nothing else.
      const sample = trims[0];
      const moved = sample.tuning.filter((tuning) => tuning.gainDb !== 0).map((tuning) => tuning.sourceId);
      expect(moved).toEqual(grouping.groups.find((group) => group.id === direction).sourceIds);
      expect(sample.tuning.every((tuning) => tuning.delayMs === 0 && tuning.polarity === 1)).toBe(true);
    }
  });

  it('retains the best step of the sweep for confirmation', () => {
    const grouping = defineGainGroups(MARQUEE_SUBS, MARQUEE_ROOM);
    // Deterministic stand-in for the fast proxy: the real planner must retain
    // the best step per group and metric — never discard the best attempt.
    const scored = generateGroupedGainCoarseCandidates(grouping, marqueeBaseline()).map((row) => ({
      ...row,
      proxy: {
        primaryRangeDb: row.adjustmentDb === -3 ? 2 : 5,
        allSeatRangeDb: row.adjustmentDb === -3 ? 3 : 6,
      },
    }));
    const plan = planGroupedGainRefinement(scored);
    const retained = scored.filter((row) => plan.retainedIds.includes(row.id));
    // One retained step per group (the two metrics agree on it), and the frozen
    // Current control is never among them.
    expect(retained.length).toBe(2);
    expect(retained.every((row) => row.adjustmentDb === -3)).toBe(true);
    expect(retained.every((row) => row.isCurrent === false)).toBe(true);
  });

  it('keeps gain "not applicable" only for layouts with no independent gain', () => {
    const single = defineGainGroups([MARQUEE_SUBS[0]], MARQUEE_ROOM);
    expect(single.status).toBe('skipped');
    expect(single.reason).toMatch(/one source/i);
  });
});

describe('gain verdict never claims "not applicable" before it is judged', () => {
  const stageOf = (display, key) => display.stages.find((stage) => stage.key === key);

  it('leaves gain un-verdictted while an earlier calibration lever runs', () => {
    const display = buildStageDisplay({
      phase: 'calibrating',
      phaseLabel: 'Testing grouped delay adjustments',
      status: 'optimising',
      stageVerdicts: { phase_polarity: 'done' },
    });
    expect(stageOf(display, 'gain').status).toBe('pending');
    expect(stageOf(display, 'gain').status).not.toBe('not_tested');
    expect(display.activeStageKey).toBe('delays');
  });

  it('reports a searched gain family that improved nothing as tested', () => {
    const display = buildStageDisplay({
      phase: 'finalising',
      status: 'optimising',
      stageVerdicts: { gain: 'no_improvement' },
    });
    expect(stageOf(display, 'gain').status).toBe('completed');
    expect(stageOf(display, 'gain').verdict).toBe('no_improvement');
  });

  it('still reports "not tested" when the family genuinely cannot be adjusted', () => {
    const display = buildStageDisplay({
      phase: 'finalising',
      status: 'optimising',
      stageVerdicts: { gain: 'skipped' },
    });
    expect(stageOf(display, 'gain').status).toBe('not_tested');
  });

  it('publishes a gain verdict only from the search that ran', () => {
    const engine = read('src/components/room/bass/improveBassV2/improveBassV2Engine.js');
    // The only "skipped" gain verdict left is the grouping-reported one.
    expect(engine).not.toMatch(/"gain",\s*"skipped"/);
    expect(engine.includes('const gainNotAdjustable = gainDiagnostics.status === "skipped" || gainDiagnostics.status === "ambiguous";')).toBe(true);
    // A sweep that ran reports a result — never "not applicable".
    expect(engine.includes(': gainNotAdjustable ? "skipped"')).toBe(true);
    expect(engine.includes(': "no_improvement";')).toBe(true);
    // Whether this design can be trimmed is recorded from the run itself.
    expect(engine.includes('gainAdjustable: gainSearch?.status === "eligible",')).toBe(true);
    // The best evaluated attempt is kept as evidence whether or not it won.
    expect(engine.includes('const bestGainPair = pickBestGainAttempt(gainConfirmedPairs);')).toBe(true);
    expect(engine.includes('gainDiagnostics.bestAttempt = {')).toBe(true);
  });
});

describe('gain family evidence', () => {
  const diagnosticsWith = (gainStage) => ({ stages: [gainStage] });

  it('carries the run\u2019s own reason when gain was tested with no improvement', () => {
    const reason = 'No useful improvement found: no candidate cleared the materiality gate.';
    const ledger = buildFamilyLedger({
      selection: {},
      diagnostics: diagnosticsWith({
        name: 'Gain', reason, candidatesEvaluated: { confirmed: 6, valid: 6 },
      }),
      current: null,
    });
    const gain = gainFamilyOf(ledger);
    expect(gain.status).toBe(OPTIMISER_FAMILY_STATUS.EVALUATED);
    expect(gain.status).not.toBe(OPTIMISER_FAMILY_STATUS.NOT_TESTED);
    expect(gain.candidatesEvaluated).toBe(6);
    expect(gain.reason).toBe(reason);
  });

  it('states the technical reason when gain genuinely could not be adjusted', () => {
    const reason = 'One source: no inter-sub gain search.';
    const ledger = buildFamilyLedger({
      selection: {},
      diagnostics: diagnosticsWith({
        name: 'Gain', reason, candidatesEvaluated: { confirmed: 0, valid: 0 },
      }),
      current: null,
    });
    const gain = gainFamilyOf(ledger);
    expect(gain.status).toBe(OPTIMISER_FAMILY_STATUS.NOT_TESTED);
    expect(gain.reason).toBe(reason);
  });

  it('offers nothing to apply from the gain evidence', () => {
    const ledger = buildFamilyLedger({
      selection: {},
      diagnostics: diagnosticsWith({
        name: 'Gain', reason: 'No useful improvement found.', candidatesEvaluated: { confirmed: 4, valid: 4 },
      }),
      current: null,
    });
    expect(gainFamilyOf(ledger).accepted).toBe(false);
    expect(gainFamilyOf(ledger).applicable).toBe(false);
  });
});