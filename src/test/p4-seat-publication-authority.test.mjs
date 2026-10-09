// p4-seat-publication-authority.test.mjs
// ---------------------------------------------------------------------------
// Acceptance tests for the controlled P4 correction and the single assessment
// status.
//
//   TEST 1  P4 with eight completed seat results, including a calculated
//           failure → the seat evidence is the authority, the failure is
//           terminal, and every seat result is preserved.
//   TEST 2  P4 with genuinely incomplete seat results → still blocked. The
//           terminal-state requirement is NOT relaxed.
//   TEST 3  Calculated but unsaved → ONE "Ready to save" status, no repeated
//           developer wording.
//   TEST 4  Publication blocked by P4 only → the bass band stays in the bass
//           domain: the completed bass result is current, the overall position
//           is stated without naming P4, and no bass action is offered.
//   TEST 5  Saved and acknowledged → "Performance Current" (the state a refresh
//           restores from the durable publication).
//
// The publication contract is the authority under test; the terminal check used
// here is the exact check the contract itself applies to P4.
// ---------------------------------------------------------------------------

import { test, expect } from 'vitest';
import { buildAtomicParameterIndex } from '../../shared/engineeringPublicationContract.js';
import { isTerminalAssessment } from '../../shared/assessmentTerminal.js';

// The status vocabulary reads the completed-result store, which initialises the
// app client from the browser globals. Supply the ones it expects before the
// module is imported.
globalThis.window = {
  location: { href: 'http://localhost/', search: '', pathname: '/', hash: '', origin: 'http://localhost' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  history: { replaceState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = { title: '' };

const { resolveBassAuthorityState } = await import('../components/room/bass/bassAuthorityState.js');

const seatRow = (index, level, status = 'scored') => ({
  seatId: `seat-${index}`,
  row: 1,
  column: index,
  priority: 'primary',
  isPrimary: index === 1,
  value: index,
  valueFormatted: `±${index} dB`,
  level,
  status,
  worstFrequencyHz: 60,
});

const publicationWith = ({ seats, room = null }) => ({
  engineering_fingerprint: 'eng:a',
  published_at: '2026-01-01T00:00:00.000Z',
  engineering_summary: {
    project: { reportCounts: { seatResultsByParameter: { p4: seats } } },
    roomResultsByParameter: room ? { 4: room } : {},
    parameterAuthority: {},
  },
  provenance: { bass_fingerprint: 'cal:a' },
});

/** Exactly the terminal check the publication contract applies to P4. */
const p4IsTerminal = (item) => isTerminalAssessment(
  { ...item.source_row, level: item.level },
  { requireState: false },
);

test('TEST 1 — P4 with eight completed seat results, including a calculated failure, is terminal', () => {
  const index = buildAtomicParameterIndex(publicationWith({
    seats: [
      seatRow(1, 'L3'), seatRow(2, 'L2'), seatRow(3, 'L1'), seatRow(4, 'FAIL'),
      seatRow(5, 'L2'), seatRow(6, 'L3'), seatRow(7, 'L1'), seatRow(8, 'L2'),
    ],
    // An incomplete room-level P4 entry must never be the authority.
    room: { state: 'provisional', level: null, value: null },
  }));

  // The seat evidence decides, not the room entry.
  expect(index.P4.source_row.status).toBe('scored');
  expect(index.P4.level).toBe('FAIL');
  expect(p4IsTerminal(index.P4)).toBe(true);

  // Every seat result is preserved, with the level each seat was graded at.
  expect(index.P4.supporting_per_seat).toHaveLength(8);
  expect(index.P4.supporting_per_seat.map((row) => row.level).sort())
    .toEqual(['FAIL', 'L1', 'L1', 'L2', 'L2', 'L2', 'L3', 'L3']);
});

test('TEST 2 — genuinely incomplete P4 seat results still block publication', () => {
  const incomplete = buildAtomicParameterIndex(publicationWith({
    seats: [seatRow(1, '—', 'provisional'), seatRow(2, '—', 'provisional')],
    // A complete room-level entry cannot rescue an incomplete seat assessment.
    room: { state: 'scored', level: 'L4', value: 1, formatted: '±1 dB' },
  }));
  expect(p4IsTerminal(incomplete.P4)).toBe(false);

  // No seat evidence at all has never been P4 authority either: the check above
  // is the contract's own, so publication stays blocked rather than inventing one.
  const noSeats = buildAtomicParameterIndex(publicationWith({ seats: [] }));
  expect(noSeats.P4).toBeUndefined();
});

const currentAuthority = {
  projectId: 'project:a',
  versionId: 'version:a',
  completedBassAuthority: {
    authorityStatus: 'AUTHORITATIVE',
    currentFingerprint: 'cal:a',
    contract: { job: { resultFingerprint: 'cal:a' } },
  },
  engineeringFingerprint: 'eng:a',
  publicationBassFingerprint: 'cal:a',
};

test('TEST 3 — calculated but unsaved is one Ready to save status', () => {
  const state = resolveBassAuthorityState(currentAuthority);
  expect(state.label).toBe('Ready to save');
  expect(state.actionLabel).toBe('Save Assessment');
  expect(state.attention).not.toBe(true);
  expect(state.message).not.toMatch(/engineering_summary|parameter_index|calculated_not_published/i);
});

test('TEST 4 — a P4-only blocker is never named inside the bass band', () => {
  const state = resolveBassAuthorityState({
    ...currentAuthority,
    publicationAttempt: {
      status: 'failed',
      fingerprint: 'eng:a',
      message: 'The saved assessment is incomplete (engineering_summary.p4 is not terminal, parameter_index.P4.level is not a terminal published result).',
      missing: [{ key: 'engineering_summary.p4' }, { key: 'parameter_index.P4.level' }],
    },
  });

  // P4 is not a bass parameter: the completed bass result is saved and current,
  // and the whole-design position is stated without naming P4.
  expect(state.code).toBe('current');
  expect(state.label).toBe('Performance Current');
  expect(state.attention).not.toBe(true);
  expect(state.message).toBeNull();
  expect(state.note).toBe('Overall design assessment is not yet complete.');
  expect(state.actionLabel).toBeNull();
  expect(JSON.stringify(state)).not.toMatch(/\bP4\b/);
});

test('TEST 5 — a saved and acknowledged assessment restores Performance Current', () => {
  const state = resolveBassAuthorityState({
    ...currentAuthority,
    publicationAttempt: { status: 'acknowledged', fingerprint: 'eng:a' },
    durable: {
      version: { id: 'version:a', published_fingerprint: 'eng:a' },
      publication: {
        engineering_fingerprint: 'eng:a',
        provenance: { bass_fingerprint: 'cal:a' },
        report_snapshot: { report_project: { project_id: 'project:a', version_id: 'version:a' } },
      },
      acknowledgement: { durably_published: true },
    },
  });
  expect(state.label).toBe('Performance Current');
  expect(state.attention).not.toBe(true);
});