/**
 * Room Designer version workflow — contract tests.
 *
 * Covers the two rules that decide what the version bar and version switcher
 * show: when unsaved work must be protected before another version opens, and
 * that each version's report/proposal status is derived for that version alone
 * (never mixed with another version's).
 *
 * The report status follows the ONE canonical Project Report and the SAME
 * fingerprint comparison the report pages, the Project Library and the
 * Proposal Centre use. Legacy 'visual'/'technical' report types are retired
 * and never satisfy the selector.
 */

import { describe, test, expect } from 'vitest';
import {
  VERSION_SWITCH_ACTION,
  hasUnsavedVersionChanges,
  isSameVersion,
  versionSwitchQuestion,
} from '@/components/versions/versionSwitchSafety';
import {
  NO_REPORTS_LABEL,
  CURRENT_REPORTS_LABEL,
  REPORTS_NEED_UPDATING_LABEL,
  REPORTS_VERIFICATION_UNAVAILABLE_LABEL,
  REPORT_STATE,
  deriveVersionDocumentStatus,
} from '@/components/versions/versionDocumentStatus';

const V1 = 'version-1-level-1';
const V4 = 'version-4-level-4';

const snapshot = (overrides) => ({
  id: `snap-${overrides.version_id}-${overrides.report_type}`,
  version_id: V1,
  report_type: 'project',
  status: 'current',
  report_schema_version: 1,
  payload: { pages: [] },
  source_fingerprints: { engineeringFingerprint: 'eng-v1', calculationFingerprint: null, seatPriorityFingerprint: null },
  generated_at: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

const proposal = (overrides) => ({
  id: `proposal-${overrides.status}`,
  status: 'draft',
  selected_version_ids: [],
  version_id: null,
  updated_date: '2026-10-02T10:00:00.000Z',
  ...overrides,
});

const fpByVersion = (entries) => new Map(entries);

describe('unsaved version change protection', () => {
  test('TEST 1 — unsaved work is protected, settled autosave is not', () => {
    expect(hasUnsavedVersionChanges('dirty')).toBe(true);
    expect(hasUnsavedVersionChanges('saving')).toBe(true);
    expect(hasUnsavedVersionChanges('error')).toBe(true);
    expect(hasUnsavedVersionChanges('saved')).toBe(false);
    expect(hasUnsavedVersionChanges('idle')).toBe(false);
    expect(hasUnsavedVersionChanges('hydrating')).toBe(false);
  });

  test('TEST 2 — the question names the version being left', () => {
    expect(versionSwitchQuestion('Level 1 version'))
      .toBe('You have unsaved changes in Level 1 version. Save before opening another version?');
    expect(versionSwitchQuestion('')).toContain('this version');
  });

  test('TEST 3 — the three answers are the only ones offered', () => {
    expect(Object.values(VERSION_SWITCH_ACTION)).toEqual([
      'save_and_open',
      'open_without_saving',
      'cancel',
    ]);
  });

  test('TEST 4 — a version is only "already open" when the ids match', () => {
    expect(isSameVersion(V1, V1)).toBe(true);
    expect(isSameVersion(V1, V4)).toBe(false);
    expect(isSameVersion(null, V1)).toBe(false);
  });
});

describe('per-version document status', () => {
  test('TEST 5 — each version carries its own Project Report status', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [
        snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: 'eng-v1' } }),
        snapshot({ version_id: V4, source_fingerprints: { engineeringFingerprint: 'eng-v4-old' } }),
      ],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([
        [V1, 'eng-v1'],
        [V4, 'eng-v4-new'],
      ]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.CURRENT);
    expect(status.get(V1).reportsLabel).toBe(CURRENT_REPORTS_LABEL);
    expect(status.get(V1).reportsGenerated).toEqual(['project']);
    expect(status.get(V4).reportsState).toBe(REPORT_STATE.STALE);
    expect(status.get(V4).reportsLabel).toBe(REPORTS_NEED_UPDATING_LABEL);
    expect(status.get(V4).reportsGenerated).toEqual(['project']);
  });

  test('TEST 6 — a version with no saved report says so, and no status leaks across versions', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: 'eng-v1' } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, 'eng-v1'], [V4, 'eng-v4']]),
    });

    expect(status.get(V1).reportsLabel).toBe(CURRENT_REPORTS_LABEL);
    expect(status.get(V4).reportsLabel).toBe(NO_REPORTS_LABEL);
    expect(NO_REPORTS_LABEL).toBe('No report yet');
  });

  test('TEST 7 — a proposal is reported against the versions it was built from', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [],
      proposals: [
        proposal({ id: 'p-comparison', status: 'generated', selected_version_ids: [V1, V4] }),
        proposal({ id: 'p-older', status: 'draft', version_id: V4, updated_date: '2026-09-01T10:00:00.000Z' }),
      ],
      currentFingerprintByVersion: fpByVersion([[V1, 'eng-v1'], [V4, 'eng-v4']]),
    });

    expect(status.get(V1).proposal.id).toBe('p-comparison');
    expect(status.get(V4).proposal.id).toBe('p-comparison');
    expect(status.get(V1).proposalLabel).toBe(status.get(V4).proposalLabel);
  });

  test('TEST 8 — the canonical report per version is the one that counts, by the shared rule', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [
        snapshot({ id: 'older', version_id: V1, generated_at: '2026-09-01T10:00:00.000Z', source_fingerprints: { engineeringFingerprint: 'eng-v1' } }),
        snapshot({ id: 'newer', version_id: V1, generated_at: '2026-10-03T10:00:00.000Z', source_fingerprints: { engineeringFingerprint: 'eng-v1' } }),
      ],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, 'eng-v1']]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.CURRENT);
    expect(status.get(V1).reportsGenerated).toEqual(['project']);
  });

  test('TEST 9 — a report payload that cannot be restored is not counted as a report', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [
        snapshot({ version_id: V4, report_schema_version: 0, payload: {} }),
      ],
      proposals: [],
    });

    expect(status.get(V4)).toBeUndefined();
  });

  test('TEST 10 — a legacy visual/technical report never satisfies the selector', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [
        snapshot({ version_id: V1, report_type: 'visual', status: 'current' }),
        snapshot({ version_id: V1, report_type: 'technical', status: 'current' }),
      ],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, 'eng-v1']]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.MISSING);
    expect(status.get(V1).reportsLabel).toBe(NO_REPORTS_LABEL);
    expect(status.get(V1).reportsGenerated).toEqual([]);
  });

  // The same canonical design-fact comparison the Document Workflow cards use
  // (identifyDesignChanges) is now the authority for the version-switcher badge
  // too. A fingerprint mismatch with no design change is a presentation-only
  // move (Current), not "needs updating". This is the Leeds correction: the
  // badge must agree with the Document Workflow cards.
  const reportProject = (overrides) => ({
    roomDims: '4.5|6.0|2.4',
    dolby_config: '7.1.4',
    subwooferInstances: [],
    front_subs_cfg: { count: 2 },
    rear_subs_cfg: { count: 0 },
    ...overrides,
  });
  const publication = (fingerprint, reportProjectOverrides) => ({
    report_snapshot: { report_project: reportProject(reportProjectOverrides) },
  });

  test('TEST 11 — a fingerprint mismatch with no design change is Current (presentation-only move)', () => {
    const SAVED = 'eng-saved';
    const CURRENT = 'eng-current';
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: SAVED } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, CURRENT]]),
      publicationsByVersion: new Map([
        [V1, { [SAVED]: publication(SAVED), [CURRENT]: publication(CURRENT) }],
      ]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.CURRENT);
    expect(status.get(V1).reportsLabel).toBe(CURRENT_REPORTS_LABEL);
  });

  test('TEST 12 — a fingerprint mismatch with a material design change is Stale', () => {
    const SAVED = 'eng-saved';
    const CURRENT = 'eng-current';
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: SAVED } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, CURRENT]]),
      publicationsByVersion: new Map([
        [V1, {
          [SAVED]: publication(SAVED, { dolby_config: '7.1.4' }),
          [CURRENT]: publication(CURRENT, { dolby_config: '5.1.4' }),
        }],
      ]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.STALE);
    expect(status.get(V1).reportsLabel).toBe(REPORTS_NEED_UPDATING_LABEL);
  });

  test('TEST 13 — a fingerprint mismatch with a missing publication is Verification unavailable', () => {
    const SAVED = 'eng-saved';
    const CURRENT = 'eng-current';
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: SAVED } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, CURRENT]]),
      publicationsByVersion: new Map([[V1, { [CURRENT]: publication(CURRENT) }]]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.VERIFICATION_UNAVAILABLE);
    expect(status.get(V1).reportsLabel).toBe(REPORTS_VERIFICATION_UNAVAILABLE_LABEL);
  });

  test('TEST 14 — no publications supplied falls back to fingerprint comparison (Stale, not unavailable)', () => {
    const SAVED = 'eng-saved';
    const CURRENT = 'eng-current';
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: SAVED } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, CURRENT]]),
      publicationsByVersion: new Map([[V1, null]]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.STALE);
    expect(status.get(V1).reportsLabel).toBe(REPORTS_NEED_UPDATING_LABEL);
  });

  test('TEST 15 — a matching fingerprint is Current regardless of publications', () => {
    const FP = 'eng-v1';
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: FP } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, FP]]),
      publicationsByVersion: null,
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.CURRENT);
    expect(status.get(V1).reportsLabel).toBe(CURRENT_REPORTS_LABEL);
  });

  // Leeds regression: the real Production scenario — a client-name correction
  // ("Rotherham Proejct" → "Rotherham Project") plus a legacy subwoofer metadata
  // change, with identical subwooferInstances. identifyDesignChanges compares
  // only engineering design categories (room, screen, seating, speakers,
  // subwoofers, performance, acoustic treatment) — never client_name or legacy
  // front_subs_cfg/rear_subs_cfg. So the badge must read Current, agreeing with
  // the Document Workflow cards.
  test('TEST 16 — Leeds: client-name correction + legacy metadata change stays Current', () => {
    const SAVED = 'eng-saved-leeds';
    const CURRENT = 'eng-current-leeds';
    const leedsPublication = (clientName, legacyPlacementMode) => ({
      report_snapshot: {
        report_project: reportProject({
          client_name: clientName,
          front_subs_cfg: { count: 2, placementMode: legacyPlacementMode, isManual: false },
          rear_subs_cfg: { count: 0, placementMode: 'auto', isManual: false },
        }),
      },
    });
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: SAVED } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, CURRENT]]),
      publicationsByVersion: new Map([
        [V1, {
          [SAVED]: leedsPublication('Rotherham Proejct', 'auto'),
          [CURRENT]: leedsPublication('Rotherham Project', 'manual'),
        }],
      ]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.CURRENT);
    expect(status.get(V1).reportsLabel).toBe(CURRENT_REPORTS_LABEL);
  });

  test('TEST 17 — Leeds: a genuine subwoofer-position change is Stale', () => {
    const SAVED = 'eng-saved-leeds';
    const CURRENT = 'eng-current-leeds';
    const withSubs = (x) => ({
      report_snapshot: {
        report_project: reportProject({
          subwooferInstances: [{ id: 'sub-1', model: 'SUB3-12', enabled: true, position: { x, y: 2 }, bottomHeightM: 0.1 }],
        }),
      },
    });
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1, source_fingerprints: { engineeringFingerprint: SAVED } })],
      proposals: [],
      currentFingerprintByVersion: fpByVersion([[V1, CURRENT]]),
      publicationsByVersion: new Map([
        [V1, { [SAVED]: withSubs(1.0), [CURRENT]: withSubs(3.5) }],
      ]),
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.STALE);
    expect(status.get(V1).reportsLabel).toBe(REPORTS_NEED_UPDATING_LABEL);
  });
});