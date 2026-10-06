/**
 * Room Designer version workflow — contract tests.
 *
 * Covers the two rules that decide what the version bar and version switcher
 * show: when unsaved work must be protected before another version opens, and
 * that each version's report/proposal status is derived for that version alone
 * (never mixed with another version's).
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
  REPORT_STATE,
  deriveVersionDocumentStatus,
} from '@/components/versions/versionDocumentStatus';

const V1 = 'version-1-level-1';
const V4 = 'version-4-level-4';

const snapshot = (overrides) => ({
  id: `snap-${overrides.version_id}-${overrides.report_type}`,
  version_id: V1,
  report_type: 'visual',
  status: 'current',
  report_schema_version: 1,
  payload: { pages: [] },
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
  test('TEST 5 — each version carries its own report status', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [
        snapshot({ version_id: V1, report_type: 'visual', status: 'current' }),
        snapshot({ version_id: V1, report_type: 'technical', status: 'current' }),
        snapshot({ version_id: V4, report_type: 'visual', status: 'stale' }),
      ],
      proposals: [],
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.CURRENT);
    expect(status.get(V1).reportsLabel).toBe('Current reports');
    expect(status.get(V4).reportsState).toBe(REPORT_STATE.STALE);
    // The dealer's words for a version whose reports the design moved past.
    expect(status.get(V4).reportsLabel).toBe('Reports need updating');
    expect(status.get(V4).reportsGenerated).toEqual(['visual']);
  });

  test('TEST 6 — a version with no saved report says so, and no status leaks across versions', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [snapshot({ version_id: V1 })],
      proposals: [],
    });

    expect(status.get(V1).reportsLabel).toBe('Current reports');
    expect(status.get(V4)).toBeUndefined();
    expect(NO_REPORTS_LABEL).toBe('No reports yet');
  });

  test('TEST 7 — a proposal is reported against the versions it was built from', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [],
      proposals: [
        proposal({ id: 'p-comparison', status: 'generated', selected_version_ids: [V1, V4] }),
        proposal({ id: 'p-older', status: 'draft', version_id: V4, updated_date: '2026-09-01T10:00:00.000Z' }),
      ],
    });

    expect(status.get(V1).proposal.id).toBe('p-comparison');
    expect(status.get(V4).proposal.id).toBe('p-comparison');
    expect(status.get(V1).proposalLabel).toBe(status.get(V4).proposalLabel);
  });

  test('TEST 8 — the newest report per version and type is the one that counts', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [
        snapshot({ id: 'older', version_id: V1, report_type: 'visual', status: 'stale', generated_at: '2026-09-01T10:00:00.000Z' }),
        snapshot({ id: 'newer', version_id: V1, report_type: 'visual', status: 'current', generated_at: '2026-10-03T10:00:00.000Z' }),
      ],
      proposals: [],
    });

    expect(status.get(V1).reportsState).toBe(REPORT_STATE.CURRENT);
    expect(status.get(V1).reportsGenerated).toEqual(['visual']);
  });

  test('TEST 9 — a report payload that cannot be restored is not counted as a report', () => {
    const status = deriveVersionDocumentStatus({
      snapshots: [
        snapshot({ version_id: V4, report_type: 'visual', report_schema_version: 0, payload: {} }),
      ],
      proposals: [],
    });

    expect(status.get(V4)).toBeUndefined();
  });
});