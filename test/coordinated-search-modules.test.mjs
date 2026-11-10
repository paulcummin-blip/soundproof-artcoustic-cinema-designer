// coordinated-search-modules.test.mjs
// Validation tests for the Bass ADI coordinated search modules.
// These tests exercise the pure budget, ranking, and options modules
// without the full acoustic engine.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSearchBudget, meetsEarlyExit, SEARCH_BOUNDS } from '../src/components/room/bass/improveBassV2/coordinatedSearchBudget.js';
import { qualifyCandidate, compareWithBaseline, preferSimpler, areDistinctOptions } from '../src/components/room/bass/improveBassV2/coordinatedSearchRanking.js';
import { buildOptions, buildOption } from '../src/components/room/bass/improveBassV2/coordinatedSearchOptions.js';

// ── Budget ─────────────────────────────────────────────────────

describe('Coordinated Search Budget', () => {
  it('starts with full budget remaining', () => {
    const budget = createSearchBudget();
    assert.ok(budget.remainingMs() > 0);
    assert.equal(budget.canonicalConfirmationsUsed(), 0);
    assert.equal(budget.isExhausted(), false);
  });

  it('tracks canonical confirmations', () => {
    const budget = createSearchBudget({ MAX_CANONICAL_CONFIRMATIONS: 3 });
    assert.equal(budget.claimCanonicalConfirmation(), true);
    assert.equal(budget.canonicalConfirmationsUsed(), 1);
    assert.equal(budget.claimCanonicalConfirmation(), true);
    assert.equal(budget.claimCanonicalConfirmation(), true);
    assert.equal(budget.claimCanonicalConfirmation(), false);
    assert.equal(budget.isExhausted(), true);
  });

  it('meetsEarlyExit detects strong candidates', () => {
    const strongEvidence = {
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 4, variationDb: 2.0 },
      sharedCancellations: [],
    };
    assert.equal(meetsEarlyExit(strongEvidence, true), true);
  });

  it('meetsEarlyExit rejects weak P20', () => {
    const weakEvidence = {
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 1, variationDb: 8.0 },
      sharedCancellations: [],
    };
    assert.equal(meetsEarlyExit(weakEvidence, true), false);
  });

  it('meetsEarlyExit rejects serious cancellation', () => {
    const evidence = {
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 4, variationDb: 2.0 },
      sharedCancellations: [{ severity: 'serious' }],
    };
    assert.equal(meetsEarlyExit(evidence, true), false);
  });
});

// ── Ranking: Qualification ─────────────────────────────────────

describe('Coordinated Search Ranking — Qualification', () => {
  it('qualifies a complete, safe candidate', () => {
    const evidence = {
      p14: { achievedDb: 115, targetDb: 112, headroomDb: 3 },
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 4, variationDb: 2.0 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.0, level: 4 }],
      receipt: { selectedCandidateId: 'cand-1' },
      sharedCancellations: [],
    };
    const result = qualifyCandidate(evidence, { p14Passes: true });
    assert.equal(result.qualified, true);
    assert.equal(result.issues.length, 0);
  });

  it('rejects insufficient P14', () => {
    const evidence = {
      p14: { achievedDb: 108, targetDb: 112, headroomDb: -4 },
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 4, variationDb: 2.0 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.0, level: 4 }],
      receipt: { selectedCandidateId: 'cand-1' },
      sharedCancellations: [],
    };
    const result = qualifyCandidate(evidence, { p14Passes: false });
    assert.equal(result.qualified, false);
    assert.ok(result.issues.some((i) => i.includes('P14')));
  });

  it('rejects missing evidence', () => {
    const result = qualifyCandidate(null);
    assert.equal(result.qualified, false);
  });

  it('rejects physical rejection', () => {
    const evidence = {
      p14: { achievedDb: 115, targetDb: 112 },
      p19: { level: 4 },
      p20Primary: { level: 4 },
      perSeatP20: [{ seatId: 's1' }],
      receipt: { selectedCandidateId: 'cand-1' },
      sharedCancellations: [],
    };
    const result = qualifyCandidate(evidence, { physicalRejection: 'Cabinet overlaps wall' });
    assert.equal(result.qualified, false);
  });
});

// ── Ranking: Recommendation ────────────────────────────────────

describe('Coordinated Search Ranking — Recommendation', () => {
  it('recommends a material P20 level improvement', () => {
    const baseline = {
      p14: { achievedDb: 115, targetDb: 112 },
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 1, variationDb: 8.0 },
      p20Secondary: { level: 1, variationDb: 9.0 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 8.0, level: 1 }],
      achievedP20VariationDb: 8.0,
    };
    const candidate = {
      p14: { achievedDb: 115, targetDb: 112 },
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 4, variationDb: 2.0 },
      p20Secondary: { level: 1, variationDb: 7.0 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.0, level: 4 }],
      achievedP20VariationDb: 2.0,
    };
    const result = compareWithBaseline(baseline, candidate);
    assert.equal(result.recommended, true);
  });

  it('does not recommend cosmetic improvement below 1.0 dB', () => {
    const baseline = {
      p14: { achievedDb: 115, targetDb: 112 },
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 4, variationDb: 2.5 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.5, level: 4 }],
      achievedP20VariationDb: 2.5,
    };
    const candidate = {
      p14: { achievedDb: 115, targetDb: 112 },
      p19: { level: 4, variationDb: 1.3 },
      p20Primary: { level: 4, variationDb: 2.3 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.3, level: 4 }],
      achievedP20VariationDb: 2.3,
    };
    const result = compareWithBaseline(baseline, candidate);
    assert.equal(result.recommended, false);
  });

  it('does not recommend when P19 regresses', () => {
    const baseline = {
      p14: { achievedDb: 115, targetDb: 112 },
      p19: { level: 4, variationDb: 1.5 },
      p20Primary: { level: 2, variationDb: 5.0 },
      p20Secondary: { level: 1, variationDb: 8.0 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 5.0, level: 2 }],
      achievedP20VariationDb: 5.0,
    };
    const candidate = {
      p14: { achievedDb: 115, targetDb: 112 },
      p19: { level: 3, variationDb: 2.5 },
      p20Primary: { level: 4, variationDb: 2.0 },
      p20Secondary: { level: 1, variationDb: 7.0 },
      perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.0, level: 4 }],
      achievedP20VariationDb: 2.0,
    };
    const result = compareWithBaseline(baseline, candidate);
    assert.equal(result.recommended, false);
  });

  it('prefers simpler when performance is equivalent', () => {
    const twoSub = { quantity: 2, p20Primary: { level: 4, variationDb: 2.0 }, p19: { level: 4 } };
    const fourSub = { quantity: 4, p20Primary: { level: 4, variationDb: 2.1 }, p19: { level: 4 } };
    assert.equal(preferSimpler(twoSub, fourSub) < 0, true);
  });
});

// ── Options ─────────────────────────────────────────────────────

describe('Coordinated Search Options', () => {
  it('always retains the baseline as the first option', () => {
    const baseline = {
      evidence: {
        p14: { achievedDb: 115, targetDb: 112 },
        p19: { level: 4, variationDb: 1.5 },
        p20Primary: { level: 2, variationDb: 5.0 },
        perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 5.0, level: 2 }],
        receipt: { selectedCandidateId: 'baseline' },
        sharedCancellations: [],
        achievedP20VariationDb: 5.0,
      },
      meta: { quantity: 2, coordinates: [{ x: 1, y: 0.5 }, { x: 1, y: 5.5 }], seatingPositions: [{ id: 's1', x: 2, y: 3 }] },
    };
    const result = buildOptions({ baseline, alternatives: [] });
    assert.equal(result.options.length, 1);
    assert.equal(result.options[0].optionId, 'baseline');
  });

  it('adds alternatives only when materially better and distinct', () => {
    const baseline = {
      evidence: {
        p14: { achievedDb: 115, targetDb: 112 },
        p19: { level: 4, variationDb: 1.5 },
        p20Primary: { level: 1, variationDb: 8.0 },
        perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 8.0, level: 1 }],
        receipt: { selectedCandidateId: 'baseline' },
        sharedCancellations: [],
        achievedP20VariationDb: 8.0,
      },
      meta: { quantity: 2, coordinates: [{ x: 1, y: 0.5 }, { x: 1, y: 5.5 }], seatingPositions: [{ id: 's1', x: 2, y: 3 }] },
    };
    const alt = {
      evidence: {
        p14: { achievedDb: 115, targetDb: 112 },
        p19: { level: 4, variationDb: 1.5 },
        p20Primary: { level: 4, variationDb: 2.0 },
        perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.0, level: 4 }],
        receipt: { selectedCandidateId: 'alt-1' },
        sharedCancellations: [],
        achievedP20VariationDb: 2.0,
      },
      meta: { quantity: 4, coordinates: [{ x: 1, y: 0.5 }, { x: 1, y: 5.5 }, { x: 4, y: 0.5 }, { x: 4, y: 5.5 }], seatingPositions: [{ id: 's1', x: 2, y: 3.6 }], seatingOffsetMm: -600 },
    };
    const result = buildOptions({ baseline, alternatives: [alt] });
    assert.equal(result.options.length, 2);
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.summary.alternativesPresented, 1);
  });

  it('does not add immaterial alternatives', () => {
    const baseline = {
      evidence: {
        p14: { achievedDb: 115, targetDb: 112 },
        p19: { level: 4, variationDb: 1.5 },
        p20Primary: { level: 4, variationDb: 2.0 },
        perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 2.0, level: 4 }],
        receipt: { selectedCandidateId: 'baseline' },
        sharedCancellations: [],
        achievedP20VariationDb: 2.0,
      },
      meta: { quantity: 2, coordinates: [], seatingPositions: [] },
    };
    const alt = {
      evidence: {
        p14: { achievedDb: 115, targetDb: 112 },
        p19: { level: 4, variationDb: 1.4 },
        p20Primary: { level: 4, variationDb: 1.9 },
        perSeatP20: [{ seatId: 's1', isPrimary: true, variationDb: 1.9, level: 4 }],
        receipt: { selectedCandidateId: 'alt-1' },
        sharedCancellations: [],
        achievedP20VariationDb: 1.9,
      },
      meta: { quantity: 4, coordinates: [], seatingPositions: [] },
    };
    const result = buildOptions({ baseline, alternatives: [alt] });
    assert.equal(result.options.length, 1);
    assert.equal(result.recommendations.length, 0);
  });
});

// ── Distinctness ────────────────────────────────────────────────

describe('Coordinated Search — Distinct Options', () => {
  it('identifies different quantities as distinct', () => {
    const a = { quantity: 2, coordinates: [{ x: 1, y: 1 }], seatingPositions: [] };
    const b = { quantity: 4, coordinates: [{ x: 1, y: 1 }], seatingPositions: [] };
    assert.equal(areDistinctOptions(a, b), true);
  });

  it('identifies different seating as distinct', () => {
    const a = { quantity: 2, coordinates: [], seatingPositions: [{ id: 's1', y: 3 }] };
    const b = { quantity: 2, coordinates: [], seatingPositions: [{ id: 's1', y: 3.6 }] };
    assert.equal(areDistinctOptions(a, b), true);
  });

  it('identifies identical layouts as not distinct', () => {
    const a = { quantity: 2, coordinates: [{ x: 1, y: 1 }], seatingPositions: [{ id: 's1', y: 3 }] };
    const b = { quantity: 2, coordinates: [{ x: 1, y: 1 }], seatingPositions: [{ id: 's1', y: 3 }] };
    assert.equal(areDistinctOptions(a, b), false);
  });
});