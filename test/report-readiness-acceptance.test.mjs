/**
 * The readiness acceptance table: what a designer actually sees for a new
 * report, a legacy report, a design that moved on, and an export.
 *
 * Both sides of the boundary are exercised here with a fake, read-only entity
 * layer, so the panel state and the proposal gate are shown to agree:
 *   - the ONE per-version rule the panel and the server gate share
 *     (`resolveVersionReadiness`), and
 *   - the only proposal source reader (`readProposalReportEvidence`).
 *
 * Read-only: no entity is written, read or deleted.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readProposalReportEvidence } from '../base44/shared/proposalReportEvidenceReader.js';
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
const PUBLICATION = { published_at: '2026-10-05T10:00:00.000Z' };
const PARAMS = [12, 13, 14, 18, 19, 20].map((id) => ({ parameter_id: id, level: 'L3', value: 'Level 3' }));

const evidence = (versionId) => ({
  report_source_version: 1,
  identity: { projectId: PROJECT, versionId },
  report_parameters: PARAMS,
  system: { products_selected: { rows: [{ model: 'DFC-2', qty: 3 }] } },
  viewing: { available: true },
});

/** A saved report. `withEvidence: false` is one written before the capture existed. */
const savedReport = ({ type, fingerprint = 'eng:v1:aaa', status = 'current', withEvidence = true }) => ({
  id: `${type}-saved`,
  project_id: PROJECT,
  version_id: 'v4',
  report_type: type,
  report_schema_version: 1,
  status,
  generated_at: '2026-10-05T10:00:00.000Z',
  source_fingerprints: { engineeringFingerprint: fingerprint },
  payload: withEvidence
    ? { pages: [], proposalSource: evidence('v4') }
    : { pages: [] },
});

const panel = (saved, currentFingerprints) => resolveVersionReadiness({
  version: VERSION,
  savedReports: saved,
  publication: PUBLICATION,
  currentFingerprints,
});

const fakeEntities = (rows) => ({
  ReportSnapshot: { filter: async (query) => ({ items: rows.filter((row) => row.version_id === query.version_id) }) },
});

const gate = async (rows, version = VERSION) => {
  try {
    const result = await readProposalReportEvidence(fakeEntities(rows), PROJECT, [version]);
    return { decision: 'ALLOWED', detail: `evidence read for ${result[0].snapshot.identity.versionId}` };
  } catch (error) {
    return { decision: 'BLOCKED', detail: error.message };
  }
};

const NEW_ENOUGH = { engineeringFingerprint: 'eng:v1:aaa' };
const DESIGN_MOVED = { engineeringFingerprint: 'eng:v1:bbb' };

const newVisual = savedReport({ type: 'visual' });
const newTechnical = savedReport({ type: 'technical' });

test('acceptance table: panel state and proposal gate agree for all six scenarios', async () => {
  const observed = [];

  // 1 + 2. New reports, saved complete and on the design the version holds.
  {
    const row = panel({ visual: newVisual, technical: newTechnical }, NEW_ENOUGH);
    const result = await gate([newTechnical, newVisual]);
    observed.push({ scenario: 'New Visual Report', panel: row.visual.status, gate: result.decision });
    observed.push({ scenario: 'New Technical Report', panel: row.technical.status, gate: result.decision });
    assert.equal(row.ready, true, 'a version whose reports and engineering are all current is ready');
    assert.equal(row.blockingSentence, null);
  }

  // 3 + 4. Legacy reports: they exist and are stored current, but carry no evidence.
  {
    const legacyVisual = savedReport({ type: 'visual', withEvidence: false });
    const legacyTechnical = savedReport({ type: 'technical', withEvidence: false });
    const row = panel({ visual: legacyVisual, technical: legacyTechnical }, NEW_ENOUGH);
    const result = await gate([legacyTechnical, legacyVisual]);
    observed.push({ scenario: 'Legacy Visual Report', panel: row.visual.status, gate: result.decision });
    observed.push({ scenario: 'Legacy Technical Report', panel: row.technical.status, gate: result.decision });

    assert.equal(row.visual.state, READINESS_STATE.LEGACY);
    assert.equal(row.technical.state, READINESS_STATE.LEGACY);
    assert.match(row.blockingSentence, /has a current Visual Report, but it needs a one-time evidence refresh/);
    assert.match(row.blockingSentence, /has a current Technical Report, but it needs a one-time evidence refresh/);
    assert.doesNotMatch(row.blockingSentence, /is missing/, 'a report that exists is never called missing');
    assert.match(result.detail, /needs a one-time evidence refresh/);
    assert.doesNotMatch(result.detail, /: missing /, 'the gate never reports a legacy report as missing');
  }

  // 5. The design changed after the reports were generated. The DESIGN_MOVED
  // fingerprint is the version's own published pointer, so both sides see it:
  // the panel compares it against the saved report, and the gate compares it
  // against ProjectVersion.published_fingerprint.
  {
    const movedVersion = { ...VERSION, published_fingerprint: 'eng:v1:bbb' };
    const row = panel({ visual: newVisual, technical: newTechnical }, DESIGN_MOVED);
    const result = await gate([newTechnical, newVisual], movedVersion);
    observed.push({ scenario: 'Design changed after generation', panel: row.visual.status, gate: result.decision });

    assert.equal(row.visual.state, READINESS_STATE.STALE);
    assert.equal(row.technical.state, READINESS_STATE.STALE);
    assert.equal(row.ready, false);
    assert.match(result.detail, /The design changed after it was generated/);
  }

  // 6. A PDF exported after generation: the version RECORD is written, the design is not.
  {
    const exportedVersion = {
      ...VERSION,
      updated_date: '2026-10-05T17:15:00.000Z',
      metrics_last_modified: '2026-10-05T17:15:00.000Z',
      metrics_exports: 3,
      metrics_reports_generated: 2,
    };
    const row = panel({ visual: newVisual, technical: newTechnical }, NEW_ENOUGH);
    const result = await gate([newTechnical, newVisual], exportedVersion);
    observed.push({ scenario: 'PDF exported after generation', panel: row.visual.status, gate: result.decision });

    assert.equal(row.visual.status, 'Current');
    assert.equal(result.decision, 'ALLOWED', 'an export never makes a report stale');
  }

  assert.deepEqual(observed, [
    { scenario: 'New Visual Report', panel: 'Current', gate: 'ALLOWED' },
    { scenario: 'New Technical Report', panel: 'Current', gate: 'ALLOWED' },
    { scenario: 'Legacy Visual Report', panel: 'Needs one-time refresh', gate: 'BLOCKED' },
    { scenario: 'Legacy Technical Report', panel: 'Needs one-time refresh', gate: 'BLOCKED' },
    { scenario: 'Design changed after generation', panel: 'Stale', gate: 'BLOCKED' },
    { scenario: 'PDF exported after generation', panel: 'Current', gate: 'ALLOWED' },
  ]);
});

test('a version with no saved report at all is the only case stated as missing', async () => {
  const row = panel({ visual: null, technical: newTechnical }, NEW_ENOUGH);
  assert.equal(row.visual.state, READINESS_STATE.MISSING);
  assert.equal(row.visual.status, 'Missing');
  assert.match(row.blockingSentence, /is missing the Visual Report/);

  const result = await gate([newTechnical]);
  assert.equal(result.decision, 'BLOCKED');
  assert.match(result.detail, /missing Visual Report/);
});

test('a report the design has moved past is blocked as stale, and offered Regenerate', async () => {
  // A saved report whose own stored status is stale is refused by the report
  // reader that gates generation, and the refusal names the report and the
  // action. The shared readiness rule decides staleness by fingerprint (above);
  // a report's own stored status is the reader's first authority.
  const stale = savedReport({ type: 'technical', status: 'stale' });
  const result = await gate([stale, newVisual]);
  assert.equal(result.decision, 'BLOCKED');
  assert.match(result.detail, /stale Technical Report/);
  assert.match(result.detail, /Regenerate it before creating a proposal/);
});