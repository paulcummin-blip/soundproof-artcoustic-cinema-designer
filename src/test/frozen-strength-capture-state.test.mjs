import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildReportEvidence } from '../components/report/reportEvidenceAuthority.js';
import { readReportParameter } from '../components/report/reportParameterEvidence.js';
import { summaryFromReportEvidence, collectEligibleEvidence } from '../../shared/strengthImportance.js';
import { selectStrengthStoriesFromReportEvidence } from '../../shared/strengthEvidenceContext.js';

const read = name => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));
const cases = [
  { name: 'Genesis', publication: 'genesisAdiEvidence.json', evidence: 'genesisReportEvidence.json', fingerprint: 'eng:v1:c3bc6139a955a04f' },
  { name: 'Marquee', publication: 'marqueeLiveAdiEvidence.json', evidence: 'marqueeReportEvidence.json', fingerprint: 'eng:v1:bcd7564a7c3136f8' },
];
const capture = (summary, rows) => buildReportEvidence({ reportType: 'project', captured: {
  identity: { projectId: 'fixture-only', versionId: 'fixture-only' },
  room: {}, system: {}, seats: [], report_parameters: rows,
  report_engineering_summary: summary,
} });

for (const item of cases) {
  test(`${item.name}: future reader-to-capture path preserves every frozen parameter state`, () => {
    const publication = read(item.publication);
    const evidence = read(item.evidence);
    assert.equal(evidence.identity.engineering_fingerprint, item.fingerprint);
    assert.equal(evidence.identity.source_fingerprint, item.fingerprint);
    const summary = publication.engineeringSummary;
    const before = JSON.stringify(publication);
    const rows = evidence.parameters.map(row => readReportParameter(summary, row.parameter_id));
    const captured = capture(summary, rows);
    for (const row of captured.parameters) {
      const canonical = summary.parameterAuthority[`p${row.parameter_id}`];
      assert.equal(row.state, canonical?.state ?? null, `${item.name} P${row.parameter_id}`);
      assert.equal(captured.parameter_index[row.key].state, row.state);
      for (const seat of row.supporting_per_seat) {
        const id = String(seat.seat_id ?? seat.seatId ?? '');
        assert.equal(seat.state, canonical?.seats?.[id]?.state ?? canonical?.state ?? null);
      }
    }
    const readBack = collectEligibleEvidence(summaryFromReportEvidence(captured));
    assert.equal(readBack.byKey.p19.state, 'provisional');
    assert.equal(readBack.byKey.p19.eligible, false);
    assert.equal(JSON.stringify(publication), before, 'the frozen publication is not mutated');
  });

  test(`${item.name}: provisional canonical state wins over complete/scored presentation rows`, () => {
    const summary = read(item.publication).engineeringSummary;
    const rows = [{ key: 'P19', parameter_id: 19, scope: 'rsp', level: 'L4', value: '±0 dB',
      state: 'scored', status: 'complete', source_row: { status: 'complete' },
      supporting_per_seat: [{ seat_id: 'fixture-seat', state: 'scored', status: 'complete', level: 'L4' }],
    }];
    const evidence = capture(summary, rows);
    assert.equal(evidence.parameters[0].state, 'provisional');
    assert.equal(evidence.parameters[0].supporting_per_seat[0].state, 'provisional');
    assert.equal(evidence.parameter_index.P19.state, 'provisional');
    const selected = selectStrengthStoriesFromReportEvidence(evidence);
    assert.equal(selected.byKey.p19.eligible, false);
    assert.equal(evidence.parameters[0].value, '±0 dB');
    assert.equal(evidence.parameters[0].level, 'L4');
  });
}

test('no canonical or explicit state: completion metadata is not terminal authority', () => {
  const row = { key: 'P19', parameter_id: 19, scope: 'rsp', level: 'L4', value: '±0 dB',
    status: 'complete', source_row: { status: 'complete', isAuthoritative: true } };
  const summary = { parameter_index: { P19: row } };
  const readRow = readReportParameter(summary, 19);
  assert.equal(readRow.state, null);
  const captured = capture({}, [readRow]);
  assert.equal(captured.parameters[0].state, null);
  const result = collectEligibleEvidence(summaryFromReportEvidence(captured)).byKey.p19;
  assert.equal(result.state, 'unavailable');
  assert.equal(result.eligible, false);
  assert.equal(collectEligibleEvidence(summaryFromReportEvidence({ parameters: [row] })).byKey.p19.eligible, false);
});

test('explicit seat terminal state survives capture and reader without promoting the parent', () => {
  const summary = { parameterAuthority: { p16: { state: 'scored', seats: {
    a: { state: 'provisional', level: 'L4' }, b: { state: 'scored', level: 'L3' },
  } } } };
  const rows = [{ key: 'P16', parameter_id: 16, scope: 'project', state: 'scored', level: 'L3',
    supporting_per_seat: [
      { seat_id: 'a', state: 'scored', level: 'L4' },
      { seat_id: 'b', state: 'provisional', level: 'L3' },
    ],
  }];
  const captured = capture(summary, rows);
  const authority = summaryFromReportEvidence(captured).parameterAuthority.p16;
  assert.equal(authority.state, 'scored');
  assert.equal(authority.seats.a.state, 'provisional');
  assert.equal(authority.seats.b.state, 'scored');
});