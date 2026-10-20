import { test, expect } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUpperSpeakersForSeat, computeUpperVerticalAnglesForSeat } from '../components/utils/rp22UpperSeatMetrics.jsx';
import { hasOverheadLayer, buildOverheadNotApplicableMetric } from '../components/utils/rp22/overheadLayerAuthority.js';
import { buildDesignRatingInput } from '../components/report/technical/buildDesignRatingInput.js';
import { buildArtcousticDesignRatingAuthority } from '../components/report/technical/artcousticSystemDesignRating.js';
import { summariseEngineeringResults } from '../components/engineering/engineeringSummaryAuthority.js';
import { assessEngineeringReportCompleteness, isTerminalAssessment } from '../../shared/assessmentTerminal.js';
import { buildAtomicParameterIndex, auditPublicationContract } from '../../shared/engineeringPublicationContract.js';

globalThis.window = {
  location: { href: 'http://localhost/', search: '', pathname: '/', hash: '', origin: 'http://localhost' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  history: { replaceState: () => {} }, addEventListener: () => {}, removeEventListener: () => {},
};
globalThis.document = { title: '' };
const { buildSeatHudSnapshot } = await import('../components/utils/buildSeatHudSnapshot.jsx');

// Execute the actual P9 engine section with its production geometry helpers.
// This isolates the correction from the hook's unrelated bass and UI effects.
const engine = readFileSync(new URL('../components/hooks/useRP22AnalysisEngine.jsx', import.meta.url), 'utf8');
const p9Section = engine.slice(engine.indexOf('      // P9 - Maximum vertical angle'), engine.indexOf('      // P10 – Maximum SPL difference'));
assert.ok(p9Section.length > 100);
const evaluate = new Function('seat', 'safeSpeakers', 'getUpperSpeakersForSeat', 'computeUpperVerticalAnglesForSeat', 'buildOverheadNotApplicableMetric', 'overheadLayerPresent', `
  const metrics = { p9: null }, _diag = { p9: {} }, roomCenterX = 2;
  const getCanonicalRole = role => String(role || '').toUpperCase();
  const isNum = value => typeof value === 'number' && Number.isFinite(value);
  ${p9Section}
  return metrics.p9;
`);
const seats = [{ id: 's1', x: 2, y: 3, z: 1.2, priority: 'primary', isPrimary: true }];
const pair = (prefix, y) => ['L', 'R'].map((side, i) => ({
  id: prefix + side, role: prefix + side, model: 'Evolve 3-1', enabled: true,
  position: { x: i ? 3 : 1, y, z: 2.8 },
}));
const metricFor = speakers => evaluate(seats[0], speakers, getUpperSpeakersForSeat, computeUpperVerticalAnglesForSeat, buildOverheadNotApplicableMetric, hasOverheadLayer(speakers));
function pipeline(speakers) {
  const metric = metricFor(speakers);
  const analysisResult = { perSeatRp22: { s1: { rp22: { 9: metric } } } };
  const snapshot = buildSeatHudSnapshot({ seat: seats[0], placedSpeakers: speakers, widthM: 4, lengthM: 6, heightM: 2.8, screenFrontPlaneM: 0, mlp: seats[0], analysisResult, seatingPositions: seats });
  const input = buildDesignRatingInput({ seats, analysisResult, reportSeatHudById: { s1: snapshot }, placedSpeakers: speakers });
  const authority = buildArtcousticDesignRatingAuthority(input);
  const summary = summariseEngineeringResults({ designRatingAuthority: authority, seats, seatHudById: { s1: snapshot }, perSeatRp23: {} });
  const publication = { engineering_fingerprint: 'eng:test', published_at: '2026-10-20T00:00:00Z', engineering_summary: summary };
  publication.parameter_index = buildAtomicParameterIndex(publication);
  return { metric, snapshot, input, authority, summary, publication };
}
for (const prefix of ['TF', 'TM', 'TR', 'TB']) {
  test(`one ${prefix} overhead pair is terminal N/A through engine, snapshot, rating and saved index`, () => {
    const result = pipeline(pair(prefix, 2));
    assert.equal(result.metric.level, 'N/A');
    assert.equal(result.metric.status, 'not_applicable');
    assert.equal(result.snapshot.rp22.p9.level, 'N/A');
    assert.deepEqual(result.input.p9, { s1: 'na' });
    assert.equal(result.authority.parameters.p9.state, 'na');
    assert.equal(isTerminalAssessment(result.authority.parameters.p9), true);
    assert.equal(result.publication.parameter_index.P9.level, 'N/A');
    assert.equal(result.publication.parameter_index.P9.value, 'N/A');
    assert.equal(result.publication.parameter_index.P9.supporting_per_seat[0].level, 'N/A');
    const dir = mkdtempSync(join(tmpdir(), 'p9-save-'));
    try {
      const file = join(dir, 'saved-publication.json');
      writeFileSync(file, JSON.stringify(result.publication));
      const restored = JSON.parse(readFileSync(file, 'utf8'));
      assert.deepEqual(buildAtomicParameterIndex(restored), restored.parameter_index);
      assert.equal(restored.engineering_summary.parameterAuthority.p9.state, 'na');
      assert.equal(assessEngineeringReportCompleteness(restored.engineering_summary).missingParameterKeys.includes('p9'), false);
      assert.equal(assessEngineeringReportCompleteness(restored.engineering_summary).incompleteSeatParameterKeys.includes('p9'), false);
    } finally { rmSync(dir, { recursive: true }); }
  });
}
test('two overhead pairs still calculate the real angle and unchanged L2 threshold', () => {
  const result = pipeline([...pair('TF', 2), ...pair('TR', 4)]);
  assert.ok(Math.abs(result.metric.value - 64.01076641616699) < 1e-8);
  assert.equal(result.metric.level, 2);
  assert.equal(result.authority.parameters.p9.state, 'scored');
  assert.equal(result.publication.parameter_index.P9.level, 'L2');
});
test('N/A does not excuse another incomplete parameter or an unsaved report', () => {
  const { summary } = pipeline(pair('TM', 3));
  const complete = structuredClone(summary);
  for (let n = 1; n <= 21; n++) {
    if (n !== 9) complete.parameterAuthority[`p${n}`] = { state: 'scored', scope: 'room', level: 'L3' };
  }
  assert.equal(assessEngineeringReportCompleteness(complete).complete, true);
  complete.parameterAuthority.p4 = { state: 'provisional', scope: 'room', level: null };
  assert.equal(assessEngineeringReportCompleteness(complete).complete, false);
  assert.equal(auditPublicationContract(null).allowed, false);
  assert.equal(auditPublicationContract(undefined).allowed, false);
});
