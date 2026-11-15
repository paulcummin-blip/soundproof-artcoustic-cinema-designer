// report-parameter-completeness.test.mjs
// ---------------------------------------------------------------------------
// Tests for scope-aware RP22 parameter completeness validation.

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateParameterCompleteness,
  validateRequiredParameters,
} from "../components/report/reportParameterCompleteness.js";

test('3. Correctly scoped terminal RP22 results pass', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: {
      p5: {
        state: 'scored',
        level: 'L3',
        scope: 'seat',
        seats: { s1: { state: 'scored', level: 'L3' }, s2: { state: 'scored', level: 'L2' } },
      },
    },
    paramId: 5,
  });
  assert.equal(result.complete, true);
});

test('3b. Room-scoped terminal scored result passes', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p12: { state: 'scored', level: 'L4', scope: 'room' } },
    paramId: 12,
  });
  assert.equal(result.complete, true);
});

test('4. Provisional-with-Level fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p12: { state: 'provisional', level: 'L4', scope: 'room' } },
    paramId: 12,
  });
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'state-provisional');
});

test('5. Legitimate N/A passes', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: {
      p9: {
        state: 'na',
        scope: 'seat',
        seats: { s1: { state: 'na' }, s2: { state: 'na' } },
      },
    },
    paramId: 9,
  });
  assert.equal(result.complete, true);
});

test('5b. Legitimate room-scoped N/A passes', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p7: { state: 'na', scope: 'room' } },
    paramId: 7,
  });
  assert.equal(result.complete, true);
});

test('6. Insufficient-data N/A fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: {
      p10: {
        state: 'na',
        scope: 'seat',
        formatted: 'N/A (insufficient data)',
        seats: { s1: { state: 'na', formatted: 'N/A (insufficient data)', level: '—' } },
      },
    },
    paramId: 10,
  });
  assert.equal(result.complete, false);
});

test('6b. Seat-scoped N/A with one insufficient-data seat fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: {
      p10: {
        state: 'na',
        scope: 'seat',
        seats: {
          s1: { state: 'na' },
          s2: { state: 'na', formatted: 'N/A (insufficient data)', level: '—' },
        },
      },
    },
    paramId: 10,
  });
  assert.equal(result.complete, false);
});

test('7. Completed P19 RSP evidence passes even with provisional parameter-level entry', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p19: { state: 'provisional', level: 'L4', scope: 'room' } },
    paramId: 19,
    completedBassAuthority: {
      contract: {
        productAnalysis: {
          parameters: {
            p19: { level: 4, notAssessable: false },
          },
        },
      },
    },
  });
  assert.equal(result.complete, true);
});

test('7b. P19 not-assessable terminal state passes', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p19: { state: 'provisional', scope: 'room' } },
    paramId: 19,
    completedBassAuthority: {
      contract: {
        productAnalysis: {
          parameters: {
            p19: { notAssessable: true, notAssessableReason: 'p18-extension-not-achieved' },
          },
        },
      },
    },
  });
  assert.equal(result.complete, true);
});

test('7c. P19 from retained evidence assessmentEnvelope passes', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p19: { state: 'provisional', scope: 'room' } },
    paramId: 19,
    completedBassAuthority: {
      contract: {
        assessmentEnvelope: {
          p19TargetIdentity: 'house-curve-target',
          officialP19WorstFrequencyHz: 35.2,
        },
      },
    },
  });
  assert.equal(result.complete, true);
});

test('7d. P19 with no bass authority and provisional parameter fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p19: { state: 'provisional', scope: 'room' } },
    paramId: 19,
    completedBassAuthority: null,
  });
  assert.equal(result.complete, false);
});

test('missing parameter fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: {},
    paramId: 3,
  });
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'missing-authority');
});

test('display-only Level without scored state fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: { p8: { state: 'assumed', level: 'L4', scope: 'room' } },
    paramId: 8,
  });
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'state-assumed');
});

test('validateRequiredParameters aggregates missing', () => {
  const { missing, incomplete } = validateRequiredParameters({
    parameterAuthority: {
      p2: { state: 'scored', level: 'L3', scope: 'room' },
      p3: { state: 'scored', level: 'L2', scope: 'room' },
      p5: { state: 'scored', level: 'L3', scope: 'seat', seats: { s1: { state: 'scored' } } },
      // p7 missing
      p8: { state: 'scored', level: 'L4', scope: 'room' },
      p9: { state: 'na', scope: 'seat', seats: { s1: { state: 'na' } } },
      p10: { state: 'na', scope: 'seat', formatted: 'N/A (insufficient data)', seats: { s1: { state: 'na', level: '—' } } },
      p11: { state: 'scored', level: 'L3', scope: 'room' },
      p12: { state: 'provisional', level: 'L4', scope: 'room' },
      p13: { state: 'scored', level: 'L3', scope: 'room' },
      p14: { state: 'scored', level: 'L2', scope: 'room' },
      p18: { state: 'scored', level: 'L3', scope: 'room' },
      p19: { state: 'scored', level: 'L4', scope: 'room' },
      p21: { state: 'scored', level: 'L2', scope: 'room' },
    },
    completedBassAuthority: null,
  });
  assert.ok(missing.includes(7), 'P7 should be missing');
  assert.ok(missing.includes(10), 'P10 insufficient data should be missing');
  assert.ok(missing.includes(12), 'P12 provisional should be missing');
  assert.ok(!missing.includes(9), 'P9 legitimate N/A should pass');
});

test('8. Seat-scoped scored with null top-level level passes when all seats scored', () => {
  // Mirrors the real Cable Smart P5 authority: state "scored", no top-level
  // aggregate level, but every seat is scored with a valid level.
  const result = validateParameterCompleteness({
    parameterAuthority: {
      p5: {
        key: 'p5', scope: 'seat', state: 'scored', level: null,
        seats: {
          'seat-r1-c1': { state: 'scored', level: 'L1' },
          'seat-r1-c2': { state: 'scored', level: 'L1' },
          'seat-r1-c3': { state: 'scored', level: 'L1' },
          'seat-r1-c4': { state: 'scored', level: 'L1' },
        },
      },
    },
    paramId: 5,
  });
  assert.equal(result.complete, true);
});

test('8b. Seat-scoped scored with one provisional seat still fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: {
      p5: {
        key: 'p5', scope: 'seat', state: 'scored', level: null,
        seats: {
          'seat-r1-c1': { state: 'scored', level: 'L1' },
          'seat-r1-c2': { state: 'provisional', level: null },
        },
      },
    },
    paramId: 5,
  });
  assert.equal(result.complete, false);
});

test('8c. Seat-scoped scored with empty seats fails', () => {
  const result = validateParameterCompleteness({
    parameterAuthority: {
      p5: { key: 'p5', scope: 'seat', state: 'scored', level: null, seats: {} },
    },
    paramId: 5,
  });
  assert.equal(result.complete, false);
});