/**
 * marquee-refresh.test.mjs
 * ------------------------
 * PHASE 1 + PHASE 2 live validation harness for the Marquee Home comparison.
 *
 * It runs the app's OWN builders — never a copy of them — over the four canonical
 * Marquee reports as they are stored in the database today:
 *
 *   PHASE 1  buildReportEvidence() is run again over each report's frozen
 *            proposalSource. The rebuilt evidence must be identical to the
 *            stored evidence in every fact except the new scoped seat-group
 *            block, so the refresh adds `seat_scopes` and changes nothing else.
 *            The rebuilt payloads are written out for the database write.
 *
 *   PHASE 2  buildProposalEvidence() is run over the live reader output
 *            (readProposalReportEvidence, invoked as the app user) and every
 *            scoped claim it mints is reported and checked against the gates:
 *            at least two seats in the scope, L2+ only, the level's own
 *            adjective, and nothing promoted from a narrower scope.
 *
 * Files it reads:  tmp-marquee-refresh/in.json, tmp-marquee-refresh/reader.json
 * File it writes:  tmp-marquee-refresh/out.json
 *
 * ONE-OFF operational harness: not part of the permanent suite.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildReportEvidence } from '../src/components/report/reportEvidenceAuthority.js';
import {
  buildProposalEvidence,
  proposalEvidenceFingerprint,
} from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { SCOPE_ADJECTIVE, SCOPE_PHRASE } from '../base44/shared/proposalEvidence/proposalEvidenceSeatScopes.js';

const DIR = '/app/tmp-marquee-refresh';
const read = (name) => JSON.parse(fs.readFileSync(`${DIR}/${name}`, 'utf8'));

/** An evidence payload without the scoped block and its fingerprint. */
function withoutScopes(evidence) {
  if (!evidence) return null;
  const { seat_scopes, evidence_fingerprint, ...rest } = evidence;
  return rest;
}

/** Every claim-shaped object anywhere in the pack. */
function collectClaims(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectClaims(entry, found));
    return found;
  }
  if (value && typeof value === 'object') {
    if (typeof value.claim_id === 'string') found.push(value);
    Object.values(value).forEach((entry) => collectClaims(entry, found));
  }
  return found;
}

const V_L4 = '6abbca6e199f13dc4d74ec4a';
const V_L1 = '6ac22230d40d8bb0a925ecab';
const EXPECTED_SCOPES = {
  [V_L4]: {
    primary: { p5: 'L1', p10: 'L3', p19: 'L4', p20: 'L1' },
    secondary: { p5: 'L1', p10: 'L1', p19: 'L4', p20: 'L1' },
    all: { p5: 'L1', p10: 'L1', p19: 'L4', p20: 'L1' },
  },
  [V_L1]: {
    primary: { p5: 'L2', p10: 'L3', p19: 'L4', p20: 'L1' },
    secondary: { p5: 'L1', p10: 'L1', p19: 'L4', p20: 'L1' },
    all: { p5: 'L1', p10: 'L1', p19: 'L4', p20: 'L1' },
  },
};

const results = { phase1: [], phase2: null, errors: [] };

test('PHASE 1 — the four canonical reports rebuild with seat_scopes and nothing else changed', () => {
  const input = read('in.json');
  assert.equal(input.reports.length, 4, 'the four canonical Marquee reports');

  for (const report of input.reports) {
    const label = `${report.report_type} ${report.snapshot_id}`;
    assert.ok(report.captured, `${label}: carries its frozen capture`);
    assert.ok(report.stored_evidence, `${label}: carries stored evidence`);
    assert.equal(report.status, 'current', `${label}: the saved report is current`);

    const rebuilt = buildReportEvidence({
      reportType: report.report_type,
      captured: report.captured,
      sourceFingerprint: report.source_fingerprints,
      borderThicknessM: input.border_thickness_m,
    });

    // Every fact the report already stated must survive byte-identical.
    assert.deepEqual(
      withoutScopes(rebuilt),
      withoutScopes(report.stored_evidence),
      `${label}: the refresh may only add the scoped block`,
    );
    assert.equal(
      report.stored_evidence.proposal_ready,
      true,
      `${label}: stored evidence is proposal-ready`,
    );

    // The scoped block is the new content, read from the capture's own summary.
    const expected = EXPECTED_SCOPES[report.version_id];
    const scopes = rebuilt.seat_scopes;
    assert.ok(scopes, `${label}: seat_scopes exists`);
    for (const scope of ['primary', 'secondary', 'all']) {
      assert.equal(scopes[scope].available, true, `${label}: ${scope} summary exists`);
      for (const [key, level] of Object.entries(expected[scope])) {
        assert.equal(scopes[scope].parameters[key].level, level, `${label}: ${scope}.${key} level`);
      }
    }
    assert.equal(scopes.primary.seat_count, 3, `${label}: primary seat count`);
    assert.equal(scopes.secondary.seat_count, 6, `${label}: secondary seat count`);
    assert.equal(scopes.all.seat_count, 9, `${label}: all-seat count`);
    assert.ok(rebuilt.seat_scopes?.primary?.available, `${label}: the scoped block is rebuilt`);
    const fingerprintChanged = rebuilt.evidence_fingerprint !== report.stored_evidence.evidence_fingerprint;
    assert.equal(
      rebuilt.identity.seating_fingerprint,
      report.source_fingerprints?.seatPriorityFingerprint ?? null,
      `${label}: the seat-priority fingerprint is stored`,
    );

    results.phase1.push({
      snapshot_id: report.snapshot_id,
      report_type: report.report_type,
      version_id: report.version_id,
      version_label: report.version_id === V_L4 ? 'Level 4 version' : 'Level 1 version',
      stored_fingerprint: report.stored_evidence.evidence_fingerprint,
      rebuilt_fingerprint: rebuilt.evidence_fingerprint,
      fingerprint_changed: fingerprintChanged,
      primary: { seat_count: scopes.primary.seat_count, parameters: expected.primary },
      secondary: { seat_count: scopes.secondary.seat_count, parameters: expected.secondary },
      all: { seat_count: scopes.all.seat_count, parameters: expected.all },
      evidence: rebuilt,
    });
  }
});

test('PHASE 2 — the live pack mints only scoped claims the evidence supports', () => {
  const reader = read('reader.json');
  assert.equal(reader.snapshots.length, 2, 'the two selected versions read live');
  const pack = buildProposalEvidence({ versions: reader.snapshots, generatedAt: null });
  const scoped = collectClaims(pack).filter((claim) => claim.kind === 'scoped_result');

  // ── the gates ──
  for (const claim of scoped) {
    assert.ok(['primary', 'secondary'].includes(claim.scope), `${claim.claim_id}: scope is a seat group`);
    assert.ok(Number(claim.seat_count) >= 2, `${claim.claim_id}: at least two seats in its scope`);
    assert.ok(['L2', 'L3', 'L4'].includes(claim.level), `${claim.claim_id}: L1 mints nothing`);
    assert.equal(
      claim.wording.includes(SCOPE_ADJECTIVE[claim.level]),
      true,
      `${claim.claim_id}: the level's own adjective`,
    );
    assert.equal(
      claim.wording.includes(SCOPE_PHRASE[claim.scope]),
      true,
      `${claim.claim_id}: the scope's own phrase`,
    );
    assert.equal(claim.value ?? null, null, `${claim.claim_id}: no whole-project figure is borrowed`);
    if (claim.scope === 'primary') assert.equal(claim.seat_count, 3, `${claim.claim_id}: primary seats`);
    if (claim.scope === 'secondary') assert.equal(claim.seat_count, 6, `${claim.claim_id}: secondary seats`);
  }
  assert.equal(
    scoped.some((claim) => claim.scope === 'all'),
    false,
    'a narrower scope is never promoted to all-seat wording',
  );

  // ── the parameters the audit names ──
  const byArea = (key) => [...new Set(scoped.filter((claim) => claim.area === key)
    .map((claim) => `${claim.scope}:${claim.level}:${claim.wording}`))].sort();
  const expectedClaims = {
    p5: [`primary:L2:${SCOPE_ADJECTIVE.L2} spacing ${SCOPE_PHRASE.primary}.`],
    p10: [`primary:L3:${SCOPE_ADJECTIVE.L3} overhead consistency ${SCOPE_PHRASE.primary}.`],
    p19: [
      `primary:L4:${SCOPE_ADJECTIVE.L4} bass consistency ${SCOPE_PHRASE.primary}.`,
      `secondary:L4:${SCOPE_ADJECTIVE.L4} bass consistency ${SCOPE_PHRASE.secondary}.`,
    ].sort(),
    p20: [],
  };
  const observed = { p5: byArea('p5'), p10: byArea('p10'), p19: byArea('p19'), p20: byArea('p20') };
  for (const key of ['p5', 'p10', 'p19', 'p20']) {
    assert.deepEqual(observed[key], expectedClaims[key], `${key}: the scoped claims the evidence supports`);
  }

  results.phase2 = {
    scoped_claims: scoped,
    scoped_claim_count: scoped.length,
    observed,
    pack_fingerprint: pack.pack_fingerprint || proposalEvidenceFingerprint(pack),
    allowed_claim_count: Array.isArray(pack.allowed_claims) ? pack.allowed_claims.length : null,
  };
});

test('the phase results are written for the database write', () => {
  fs.writeFileSync(`${DIR}/out.json`, JSON.stringify(results, null, 2));
  console.log('MARQUEE-REFRESH-RESULT', JSON.stringify({
    phase1: results.phase1.map((entry) => ({
      type: entry.report_type, version: entry.version_label, snapshot_id: entry.snapshot_id,
      from: entry.stored_fingerprint, to: entry.rebuilt_fingerprint,
      primary: entry.primary, secondary: entry.secondary, all: entry.all,
    })),
    phase2: {
      count: results.phase2?.scoped_claim_count,
      claims: results.phase2?.scoped_claims.map((claim) => ({
        claim_id: claim.claim_id, area: claim.area, option: claim.option, scope: claim.scope,
        seat_count: claim.seat_count, level: claim.level, wording_class: claim.wording_class,
        wording: claim.wording, authority_fingerprint: claim.authority_fingerprint,
        scope_fingerprint: claim.scope_fingerprint,
      })),
      observed: results.phase2?.observed,
      pack_fingerprint: results.phase2?.pack_fingerprint,
      allowed_claim_count: results.phase2?.allowed_claim_count,
    },
  }, null, 2));
});