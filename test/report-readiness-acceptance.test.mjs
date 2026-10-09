/**
 * The readiness acceptance table: what a designer actually sees for a new
 * report, a legacy report, a report whose evidence failed its parity check, a
 * design that moved on, and an export.
 *
 * Both sides of the boundary are exercised here with a fake, read-only entity
 * layer, so the panel state and the proposal gate are shown to agree:
 *   - the ONE per-version rule the panel and the server gate share
 *     (`resolveVersionReadiness`), and
 *   - the browser readiness authority, against the same canonical Project Report.
 * Historical Visual/Technical reports remain history, not prerequisites.
 *
 * Read-only: no entity is written, read or deleted.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolveVersionReadiness as clientReadiness } from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';
import { projectEvidence } from './fixtures/proposalReadinessFixtures.mjs';
import {
  READINESS_STATE,
  resolveVersionReadiness,
} from '../base44/shared/proposalReadinessAuthority.js';

const PROJECT = 'p1';
const VERSION = {
  id: 'v4',
  version_number: 4,
  version_name: 'Marquee Home',
  published_fingerprint: 'eng:v1:aaa',
};
/** Complete fixture authority, kept independent of the live entity layer. */
const evidence = (versionId, type, fingerprint = 'eng:v1:aaa', ready = true) => {
  const stored = projectEvidence({ versionId });
  stored.report_type = stored.identity.report_type = type;
  stored.identity.source_fingerprint = fingerprint;
  for (const row of stored.parameters) {
    if (row.source_type === 'durable-engineering-publication') row.authority_fingerprint = fingerprint;
  }
  stored.proposal_ready = ready;
  return stored;
};

/**
 * A saved report. `withEvidence: false` is one written before the evidence
 * capture existed; `frozenSource` says whether it still carries the frozen
 * source its evidence could be recovered from.
 */
const savedReport = ({
  type,
  fingerprint = 'eng:v1:aaa',
  status = 'current',
  withEvidence = true,
  ready = true,
  frozenSource = false,
}) => ({
  id: `${type}-saved`,
  project_id: PROJECT,
  version_id: 'v4',
  report_type: type,
  report_schema_version: 1,
  status,
  generated_at: '2026-10-05T10:00:00.000Z',
  source_fingerprints: { engineeringFingerprint: fingerprint },
  payload: {
    pages: [],
    ...(withEvidence ? { reportEvidence: evidence('v4', type, fingerprint, ready) } : {}),
    ...(frozenSource
      ? {
        proposalSource: {
          report_source_version: 1,
          identity: { projectId: PROJECT, versionId: 'v4' },
          viewing: { available: true },
        },
      }
      : {}),
  },
});

const panel = (saved, currentFingerprints) => clientReadiness({
  version: VERSION, savedProjectReport: saved, currentFingerprints,
});
const gate = (saved, currentFingerprints) => resolveVersionReadiness({
  version: VERSION, savedProjectReport: saved, currentFingerprints,
});
const NEW_ENOUGH = { engineeringFingerprint: 'eng:v1:aaa' };
const DESIGN_MOVED = { engineeringFingerprint: 'eng:v1:bbb' };
const current = () => savedReport({ type: 'project' });
const cases = [
  ['new Project Report', current, NEW_ENOUGH, READINESS_STATE.CURRENT],
  ['legacy evidence-free Project Report', () => savedReport({ type: 'project', withEvidence: false }), NEW_ENOUGH, READINESS_STATE.INCOMPLETE],
  ['failed evidence parity', () => savedReport({ type: 'project', ready: false }), NEW_ENOUGH, READINESS_STATE.INCOMPLETE],
  ['design changed after generation', current, DESIGN_MOVED, READINESS_STATE.STALE],
  ['PDF exported after generation', () => ({ ...current(), updated_date: '2026-10-05T17:15:00Z' }), NEW_ENOUGH, READINESS_STATE.CURRENT],
  ['missing Project Report', () => null, NEW_ENOUGH, READINESS_STATE.MISSING],
  ['unsupported payload generation', () => ({ ...current(), report_schema_version: 99 }), NEW_ENOUGH, READINESS_STATE.MISSING],
];
for (const [label, saved, fingerprints, expected] of cases) {
  test(`acceptance table: ${label} agrees across browser and server`, () => {
    const browser = panel(saved(), fingerprints);
    const server = gate(saved(), fingerprints);
    assert.equal(browser.project.state, expected);
    assert.equal(server.project.state, expected);
    assert.equal(browser.ready, expected === READINESS_STATE.CURRENT);
    assert.equal(server.ready, browser.ready);
    assert.equal(server.blockingSentence, browser.blockingSentence);
  });
}
test('stored historical source never substitutes for Project Report evidence', () => {
  const saved = savedReport({ type: 'project', withEvidence: false, frozenSource: true });
  assert.equal(panel(saved, NEW_ENOUGH).project.state, READINESS_STATE.INCOMPLETE);
  assert.equal(gate(saved, NEW_ENOUGH).ready, false);
});
test('retired report identities cannot stand in for a missing Project Report', () => {
  const historical = ['visual', 'technical'].map(type => savedReport({ type }));
  const selected = historical.find(row => row.report_type === 'project') || null;
  assert.equal(panel(selected, NEW_ENOUGH).ready, false);
  assert.equal(gate(selected, NEW_ENOUGH).ready, false);
});