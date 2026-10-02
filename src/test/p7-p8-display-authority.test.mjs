// p7-p8-display-authority.test.mjs
// ---------------------------------------------------------------------------
// The two fixed display rules this suite locks down:
//
//   P7 is whole degrees only  — 6.1° and 6.99° both state "6°", graded on the
//                               whole degree; the exact measurement stays in
//                               `deviation` for diagnostics.
//   P8 is No and L4 everywhere — a summary published before the rule still
//                               reads Level 4 / "No" on every surface, never a
//                               dash and never a "not verified" count.
//
//   TEST 1   P7 whole-degree values floor, never round up
//   TEST 2   P7 display text is whole degrees with the degree sign
//   TEST 3   The engine states and grades the floored P7 value
//   TEST 4   The report read paths state P7 in whole degrees
//   TEST 5   No P7 decimal display survives on the report surfaces
//   TEST 6   A stale summary is stamped P8 = Level 4 / "No"
//   TEST 7   The P8 parameter, scope and compliance surfaces read Level 4
//   TEST 8   The P8 summary count is assessed — not "not verified"
//   TEST 9   The stamp moves nothing else (no parameter, rating or score)
//   TEST 10  The stamp is idempotent, and the authority reader applies it
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { p7WholeDegrees, formatP7Degrees, isP7Number } from '@/components/utils/rp22/p7DisplayAuthority';
import { P8_LEVEL, P8_ACHIEVED_VALUE, P8_PRESENTATION_STATUS } from '@/components/utils/rp22/p8Authority';
import {
  stampFixedParameterAuthority,
  stampFixedParameterAuthoritySnapshot,
} from '@/components/engineering/fixedParameterAuthority';

const read = (relative) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

// A published summary of the OLD vintage: P8 present but unassessed, counted as
// "not verified" — this is what puts a dash on an already-calculated report.
const staleSummary = () => ({
  projectId: 'p1',
  versionId: 'v1',
  parameterAuthority: {
    p7: { key: 'p7', weight: 3, state: 'scored', level: 'L2', rawValue: 6 },
    p8: {
      key: 'p8', weight: 2, effectiveWeight: 2, scope: 'room', state: 'provisional',
      level: null, rawValue: null, multiplier: null, reason: 'not-calculated',
      fixedAuthority: false, seats: null,
    },
  },
  roomResultsByParameter: {
    7: { number: 7, level: 'L2', value: 6, formatted: null, unit: 'deg (\u00b1)', status: 'ok', deviation: 6.1 },
    8: { number: 8, level: null, value: null, formatted: null, status: 'no_data' },
  },
  parameterSummaries: {
    project: { p7: { level: 'L2', state: 'scored' }, p8: { level: null, state: 'provisional' } },
    primary: { p7: { level: 'L2', state: 'scored' }, p8: { level: null, state: 'provisional' } },
    secondary: { p7: { level: 'L2', state: 'scored' }, p8: { level: null, state: 'provisional' } },
  },
  project: {
    compliance: {
      byParameter: {
        p7: { level: 'L2', state: 'scored' },
        p8: { level: null, state: 'provisional', presentationStatus: 'notVerified' },
      },
      counts: { L4: 4, L3: 4, L2: 3, L1: 1, fail: 0, notVerified: 1 },
    },
    reportCounts: {
      roomLevelCounts: { L4: 4, L3: 4, L2: 3, L1: 1, fail: 0, unassessed: 1 },
      roomCalculatedCount: 12,
      seatResultsByParameter: { p7: [{ seatId: 's1', valueFormatted: '6\u00b0' }] },
    },
    rating: { numerator: 100, denominator: 120 },
  },
  designRating: { overallScore: 83, categoryScores: { spatialResolution: 80, dynamicRange: 85 } },
  seatPriorityFingerprint: 'fp-1',
});

// ---------------------------------------------------------------------------
test('TEST 1  P7 whole-degree values floor, never round up', () => {
  assert.equal(p7WholeDegrees(6.1), 6);
  assert.equal(p7WholeDegrees(6.99), 6, '6.99 must not round up to 7');
  assert.equal(p7WholeDegrees(7.0), 7, '7.0 is exactly 7');
  assert.equal(p7WholeDegrees(2.0), 2);
  assert.equal(p7WholeDegrees(9.999), 9);
  assert.equal(p7WholeDegrees(0), 0, 'a real zero is a value');
  assert.equal(p7WholeDegrees(null), null, 'a missing value stays missing, not zero');
  assert.equal(p7WholeDegrees(undefined), null);
  assert.equal(p7WholeDegrees(''), null);
  assert.equal(p7WholeDegrees('not a number'), null);
  assert.equal(isP7Number(7), true);
  assert.equal(isP7Number('7'), true);
  assert.equal(isP7Number(8), false);
});

test('TEST 2  P7 display text is whole degrees with the degree sign', () => {
  assert.equal(formatP7Degrees(6.1), '6\u00b0');
  assert.equal(formatP7Degrees(6.99), '6\u00b0');
  assert.equal(formatP7Degrees(7.0), '7\u00b0');
  assert.equal(formatP7Degrees(null), null);
  assert.equal(formatP7Degrees('abc'), null);
  for (const value of [6.1, 6.99, 7.0, 2.04, 9.99]) {
    assert.ok(!formatP7Degrees(value).includes('.'), `no decimal in "${formatP7Degrees(value)}"`);
  }
});

test('TEST 3  The engine states and grades the floored P7 value', () => {
  const engine = read('src/components/hooks/useRP22AnalysisEngine.jsx');
  assert.ok(engine.includes('import { p7WholeDegrees }'), 'engine imports the P7 authority');
  // Primary (overlay truth) path.
  assert.ok(engine.includes('const wholeDev = p7WholeDegrees(maxDev);'), 'primary path floors P7');
  assert.ok(engine.includes('if (lvlP7.L4 != null && wholeDev <= lvlP7.L4)'), 'primary path grades the whole degree');
  assert.ok(engine.includes('value: wholeDev,'), 'primary path states the whole degree');
  assert.ok(engine.includes('deviation: maxDev,'), 'exact measurement kept for diagnostics');
  // Fallback (median) path.
  assert.ok(engine.includes('const wholeDev = p7WholeDegrees(avgDev);'), 'fallback path floors P7');
  assert.ok(engine.includes('if (lvlP7.L2 != null && wholeDev <= lvlP7.L2)'), 'fallback path grades the whole degree');
  assert.ok(!engine.includes('value: isNum(avgDev) ? Number(avgDev.toFixed(1)) : null'), 'no decimal P7 value remains');
  assert.ok(!engine.includes('value: Number(maxDev.toFixed(1)),'), 'no decimal P7 value remains (primary)');
});

test('TEST 4  The report read paths state P7 in whole degrees', () => {
  const gridAuthority = read('src/components/report/technical/useParameterGridAuthority.jsx');
  assert.ok(gridAuthority.includes('if (isP7Number(id))'), 'technical report read path states P7 whole');
  assert.ok(
    gridAuthority.includes('formatP7Degrees(room.value ?? room.deviation ?? room.formatted)'),
    'technical report states whole degrees whatever the publication carries',
  );

  const complianceCard = read('src/components/report/ParameterCard.jsx');
  assert.ok(complianceCard.includes('parameter.id === 7'), 'compliance report has an explicit P7 branch');
  assert.ok(complianceCard.includes('formatP7Degrees(roomResult?.value ?? roomResult?.deviation)'), 'compliance card states whole degrees');

  const visual = read('src/components/report/client/ClientP7FrontWides.jsx');
  assert.ok(visual.includes('formatP7Degrees(maxDeviation)'), 'visual report states whole degrees');
});

test('TEST 5  No P7 decimal display survives on the report surfaces', () => {
  const p7Surfaces = [
    'src/components/report/client/ClientP7FrontWides.jsx',
    'src/components/report/client/P7PlacementGuidance.jsx',
    'src/components/report/client/print/PrintP7Content.jsx',
    'src/components/report/client/selectClientP7FrontWides.js',
  ];
  for (const file of p7Surfaces) {
    const source = read(file);
    assert.ok(!source.includes('toFixed(1)'), `${file} states no decimal angle`);
    assert.ok(!/deviation:\s*[^,\n]*toFixed/.test(source), `${file} states no decimal deviation`);
  }
  assert.ok(
    !read('src/components/report/client/ClientP7FrontWides.jsx').includes('maxDeviation.toFixed(1)'),
    'the visual report deviation text no longer carries a decimal',
  );
});

// ---------------------------------------------------------------------------
test('TEST 6  A stale summary is stamped P8 = Level 4 / "No"', () => {
  const stamped = stampFixedParameterAuthority(staleSummary());
  assert.notEqual(stamped.parameterAuthority.p8.state, 'provisional', 'P8 is no longer provisional');
  assert.equal(stamped.parameterAuthority.p8.state, 'scored');
  assert.equal(stamped.parameterAuthority.p8.level, P8_LEVEL);
  assert.equal(stamped.parameterAuthority.p8.fixedAuthority, true);
  assert.equal(stamped.parameterAuthority.p8.weight, 2, 'the configured P8 weight is preserved');

  const roomResult = stamped.roomResultsByParameter[8];
  assert.equal(roomResult.level, P8_LEVEL);
  assert.equal(roomResult.formatted, P8_ACHIEVED_VALUE, 'the achieved value reads "No"');
  assert.equal(roomResult.status, 'scored');
  // This is exactly what the technical/compliance cards read for the value.
  const displayed = roomResult.formatted || roomResult.hudLabel || (roomResult.value ?? '\u2014');
  assert.equal(displayed, P8_ACHIEVED_VALUE);
  assert.notEqual(displayed, '\u2014', 'no dash on P8');
  assert.notEqual(displayed, 'Not verified');
});

test('TEST 7  The P8 parameter, scope and compliance surfaces read Level 4', () => {
  const stamped = stampFixedParameterAuthority(staleSummary());
  for (const scope of ['project', 'primary', 'secondary']) {
    assert.equal(stamped.parameterSummaries[scope].p8.level, P8_LEVEL, `${scope} scope reads L4`);
    assert.equal(stamped.parameterSummaries[scope].p8.state, 'scored', `${scope} scope is assessed`);
  }
  const complianceP8 = stamped.project.compliance.byParameter.p8;
  assert.equal(complianceP8.level, P8_LEVEL);
  assert.equal(complianceP8.state, 'scored');
  assert.equal(complianceP8.presentationStatus, P8_PRESENTATION_STATUS);
  assert.equal(complianceP8.presentationStatus, 'assumed', 'P8 reads with the existing assumed vocabulary');
});

test('TEST 8  The P8 summary count is assessed — not "not verified"', () => {
  const stamped = stampFixedParameterAuthority(staleSummary());
  const counts = stamped.project.reportCounts.roomLevelCounts;
  assert.equal(counts.unassessed, 0, 'nothing is left unassessed');
  assert.equal(counts.L4, 5, 'P8 is counted at Level 4');
  assert.equal(stamped.project.reportCounts.roomCalculatedCount, 13, 'the calculated room count includes P8');

  const complianceCounts = stamped.project.compliance.counts;
  assert.equal(complianceCounts.notVerified, 0, 'the compliance "not verified" count no longer holds P8');
  assert.equal(complianceCounts.L4, 5);
});

test('TEST 9  The stamp moves nothing else (no parameter, rating or score)', () => {
  const original = staleSummary();
  const stamped = stampFixedParameterAuthority(original);

  assert.deepEqual(stamped.parameterAuthority.p7, original.parameterAuthority.p7);
  assert.deepEqual(stamped.roomResultsByParameter[7], original.roomResultsByParameter[7], 'P7 keeps its exact deviation');
  assert.deepEqual(stamped.parameterSummaries.project.p7, original.parameterSummaries.project.p7);
  assert.deepEqual(stamped.project.compliance.byParameter.p7, original.project.compliance.byParameter.p7);
  assert.deepEqual(stamped.project.rating, original.project.rating, 'the rating envelope is untouched');
  assert.deepEqual(stamped.designRating, original.designRating, 'no design-rating figure moves');
  assert.deepEqual(
    stamped.project.reportCounts.seatResultsByParameter,
    original.project.reportCounts.seatResultsByParameter,
  );
  assert.equal(stamped.seatPriorityFingerprint, original.seatPriorityFingerprint);
  assert.equal(stamped.projectId, original.projectId);
  assert.equal(stamped.versionId, original.versionId);
  for (const level of ['L3', 'L2', 'L1', 'fail']) {
    assert.equal(stamped.project.reportCounts.roomLevelCounts[level], original.project.reportCounts.roomLevelCounts[level]);
  }
});

test('TEST 10  The stamp is idempotent, and the authority reader applies it', () => {
  const stampedOnce = stampFixedParameterAuthority(staleSummary());
  const stampedTwice = stampFixedParameterAuthority(stampedOnce);
  assert.equal(stampedTwice, stampedOnce, 'a summary that already carries the rule is returned by identity');
  assert.equal(stampedTwice.project.reportCounts.roomLevelCounts.L4, 5, 'counts are not double-moved');

  const snapshot = { engineeringSummary: staleSummary(), projectId: 'p1' };
  const stampedSnapshot = stampFixedParameterAuthoritySnapshot(snapshot);
  assert.equal(stampedSnapshot.engineeringSummary.roomResultsByParameter[8].level, P8_LEVEL);
  assert.equal(stampedSnapshot.projectId, 'p1', 'the rest of the snapshot is preserved');
  assert.equal(
    stampFixedParameterAuthoritySnapshot(stampedSnapshot),
    stampedSnapshot,
    'an already-stamped snapshot keeps its identity (no needless re-render)',
  );

  const reader = read('src/components/engineering/versionedEngineeringAuthority.js');
  assert.ok(reader.includes('stampFixedParameterAuthority(publication?.engineering_summary || null)'), 'the durable publication is stamped');
  assert.ok(reader.includes('return stampFixedParameterAuthoritySnapshot(localSnapshot);'), 'a stored browser handoff is stamped');
  assert.ok(reader.includes('return stampFixedParameterAuthoritySnapshot(durableSnapshot || localSnapshot || null);'), 'the composed snapshot is stamped');
});