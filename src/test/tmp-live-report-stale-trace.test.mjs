/**
 * TEMPORARY TRACE — the live project's report, run through the REAL authorities.
 *
 * Not a specification: this file exists to measure what the status authority
 * actually says about the project in the app right now, from the row the
 * database holds. Delete it once the trace is recorded.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateReportEvidence } from '../../shared/reportEvidenceCompleteness.js';
import { engineeringDifferenceIsPresentationOnly } from '../components/report/designIdentityComparison.js';
import { resolveSnapshotStatus } from '../components/report/reportSnapshotAuthority.js';
import { resolveSavedReportCell } from '../components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const fixture = JSON.parse(readFileSync(new URL('../../tmp/live-report-trace.json', import.meta.url), 'utf8'));

const saved = fixture.savedSnapshot;
const evidence = saved?.payload?.reportEvidence || null;
const snapshotFp = saved?.source_fingerprints?.engineeringFingerprint || null;
const currentFp = fixture.currentFingerprints?.engineeringFingerprint || null;

describe('LIVE TRACE — the project in the app right now', () => {
  it('A. the publication move is presentation only', () => {
    const verdict = engineeringDifferenceIsPresentationOnly(fixture.savedPublication, fixture.currentPublication);
    console.log('A. presentationOnly =', verdict, '| savedFp =', snapshotFp, '| currentFp =', currentFp);
    expect(verdict).toBe(true);
  });

  it('B. the saved-report fingerprint comparison (report page)', () => {
    const verdict = resolveSnapshotStatus({
      saved,
      currentFingerprints: fixture.currentFingerprints,
      presentationOnlyMove: true,
    });
    console.log('B. resolveSnapshotStatus =', verdict.status, '| changedKeys =', JSON.stringify(verdict.changedKeys));
    expect(verdict.status).toBe('current');
  });

  it('C. evidence validated against the CURRENT authority (as the page does today)', () => {
    const result = validateReportEvidence(evidence, saved.report_type, {
      projectId: fixture.projectId,
      versionId: fixture.versionId,
      snapshotFingerprint: snapshotFp,
      sourceFingerprint: currentFp,
    });
    console.log('C. complete =', result.complete, '| missing =', JSON.stringify(result.missing));
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(['identity.source_fingerprint']);
  });

  it('D. the same evidence validated against its own frozen authority', () => {
    const result = validateReportEvidence(evidence, saved.report_type, {
      projectId: fixture.projectId,
      versionId: fixture.versionId,
      snapshotFingerprint: snapshotFp,
      sourceFingerprint: snapshotFp,
    });
    console.log('D. complete =', result.complete, '| missing =', JSON.stringify(result.missing));
    expect(result.complete).toBe(true);
  });

  it('E. proposal readiness cell (Library + Proposal Centre), as it reads today', () => {
    const cell = resolveSavedReportCell({
      saved,
      currentFingerprints: fixture.currentFingerprints,
    });
    console.log('E. cell =', cell.state, '|', cell.status);
    expect(cell.state).toBe('stale');
  });

  it('F. proposal readiness cell with the presentation-only move stated', () => {
    const cell = resolveSavedReportCell({
      saved,
      currentFingerprints: fixture.currentFingerprints,
      presentationOnlyMove: true,
    });
    console.log('F. cell =', cell.state, '|', cell.status);
    expect(cell.state).toBe('current');
  });
});