/**
 * Project Library — the readiness banner a dealer reads.
 *
 * The banner states one report per version — the Project Report — in plain
 * words, and every word it can show is dealer-safe: no internal state name, no
 * fingerprint or evidence vocabulary, and no retired report name.
 *
 *   TEST 1  Every word the banner can show is dealer-safe
 *   TEST 2  One report row per version, named as the Project Report
 *   TEST 3  The banner's verdict is the gate's verdict, never a second opinion
 *   TEST 4  A blocked version offers exactly one report action, on its own version
 *
 * Run: npx vitest run test/library-dealer-safe-readiness.test.mjs
 */

import { test, expect } from 'vitest';
import {
  READINESS_STATE,
  buildReadinessCell,
  resolveProposalReadinessGate,
  resolveVersionReadinessRow,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';
import {
  LIBRARY_CHECKING_DETAIL,
  LIBRARY_MISSING_REPORTS_DETAIL,
  LIBRARY_MISSING_REPORTS_HEADLINE,
  LIBRARY_NOT_ASSESSED_DETAIL,
  LIBRARY_READINESS_ACTION,
  LIBRARY_READINESS_HEADLINE,
  LIBRARY_READY_DETAIL,
  LIBRARY_UPDATES_NEEDED_DETAIL,
  LIBRARY_VERDICT,
  buildLibraryProposalReadiness,
} from '../src/components/library/libraryProposalReadiness.js';

const cell = (state) => buildReadinessCell({ state, generatedAt: '2026-10-04T17:11:05.564Z' });

const row = (id, name, project) => resolveVersionReadinessRow({
  versionId: id,
  versionName: name,
  versionNumber: 1,
  cells: { project: cell(project) },
});

const readinessFor = (rows, { versions = [], loading = false } = {}) => buildLibraryProposalReadiness({
  rows,
  versions,
  loading,
});

/** Every word the banner can put in front of a dealer. */
const dealerWords = (readiness) => [
  readiness.headline,
  readiness.detail,
  readiness.primaryAction?.label,
  readiness.secondaryAction?.label,
  ...(readiness.checklist || []).flatMap((entry) => [entry.line, ...entry.cells.map((c) => c.label), ...entry.cells.map((c) => c.status)]),
].filter(Boolean).join(' | ');

const FIXTURES = [
  ['current', readinessFor([row('v1', 'Level 4 version', READINESS_STATE.CURRENT)])],
  ['update needed', readinessFor([row('v1', 'Level 4 version', READINESS_STATE.STALE)])],
  ['incomplete', readinessFor([row('v1', 'Level 4 version', READINESS_STATE.INCOMPLETE)])],
  ['not generated', readinessFor([row('v1', 'Level 4 version', READINESS_STATE.MISSING)])],
  ['not assessed', readinessFor([])],
  ['checking', readinessFor([], { loading: true })],
];

/* ── TEST 1 — every word is dealer-safe ───────────────────────────────── */

test('TEST 1 — every word the banner can show is dealer-safe', () => {
  for (const [name, readiness] of FIXTURES) {
    const words = dealerWords(readiness);
    expect(words, name).not.toMatch(/stale|incomplete|missing|fingerprint|evidence|authority|parity|schema/i);
    expect(words, name).not.toMatch(/Visual Report|Technical Report/);
  }

  // The banner's own copy states the Project Report and nothing else.
  const copy = [
    LIBRARY_READY_DETAIL,
    LIBRARY_UPDATES_NEEDED_DETAIL,
    LIBRARY_MISSING_REPORTS_HEADLINE,
    LIBRARY_MISSING_REPORTS_DETAIL,
    LIBRARY_NOT_ASSESSED_DETAIL,
    LIBRARY_CHECKING_DETAIL,
    ...Object.values(LIBRARY_READINESS_HEADLINE),
    ...Object.values(LIBRARY_READINESS_ACTION),
  ].join(' | ');
  expect(copy).not.toMatch(/Visual Report|Technical Report/);
  expect(copy).toMatch(/Project Report/);
});

/* ── TEST 2 — one report row per version ──────────────────────────────── */

test('TEST 2 — one report row per version, named as the Project Report', () => {
  const readiness = readinessFor(
    [row('v1', 'Level 4 version', READINESS_STATE.CURRENT), row('v2', 'Original Design', READINESS_STATE.MISSING)],
    { versions: [{ id: 'v1' }, { id: 'v2' }] },
  );

  expect(readiness.checklist.map((entry) => entry.versionName)).toEqual(['Level 4 version', 'Original Design']);
  readiness.checklist.forEach((entry) => {
    expect(entry.cells).toHaveLength(1);
    expect(entry.cells[0].label).toBe('Project Report');
    // One line per version: ready for proposal, or the one job outstanding.
    expect(entry.line).toBe(entry.ready ? LIBRARY_READINESS_HEADLINE.READY : 'Update needed');
  });
});

/* ── TEST 3 — one authority ───────────────────────────────────────────── */

test('TEST 3 — the banner’s verdict is the gate’s verdict, word for word', () => {
  const fixtures = [
    [row('v1', 'Level 4 version', READINESS_STATE.CURRENT)],
    [row('v1', 'Level 4 version', READINESS_STATE.STALE)],
    [row('v1', 'Level 4 version', READINESS_STATE.MISSING)],
    [],
  ];

  for (const rows of fixtures) {
    const gate = resolveProposalReadinessGate({ rows, minVersions: 1 });
    const readiness = readinessFor(rows);
    expect(readiness.ready).toBe(gate.ready);
    expect(readiness.verdict).toBe(gate.ready
      ? LIBRARY_VERDICT.READY
      : rows.length === 0
        ? LIBRARY_VERDICT.NOT_ASSESSED
        : LIBRARY_VERDICT.UPDATES_NEEDED);
  }

  // A read in flight says so, and claims nothing about any report.
  const checking = readinessFor([], { loading: true });
  expect(checking.verdict).toBe(LIBRARY_VERDICT.CHECKING);
  expect(checking.ready).toBe(false);
  expect(checking.headline).toBeNull();
  expect(checking.detail).toBe(LIBRARY_CHECKING_DETAIL);
  expect(checking.showChecklist).toBe(false);
});

/* ── TEST 4 — exactly one report action, on that version ──────────────── */

test('TEST 4 — a blocked version offers one report action, for that version only', () => {
  const neverCreated = readinessFor([row('v1', 'Level 4 version', READINESS_STATE.MISSING)]);
  expect(neverCreated.primaryAction.label).toBe(LIBRARY_READINESS_ACTION.GENERATE_REQUIRED);
  expect(neverCreated.primaryAction.reportType).toBe('project');
  expect(neverCreated.primaryAction.versionId).toBe('v1');

  const movedOn = readinessFor([row('v2', 'Original Design', READINESS_STATE.STALE)]);
  expect(movedOn.primaryAction.label).toBe(LIBRARY_READINESS_ACTION.UPDATE_REQUIRED);
  expect(movedOn.primaryAction.reportType).toBe('project');
  expect(movedOn.primaryAction.versionId).toBe('v2');

  // The action always points at the version it was derived from, never the
  // version loaded in the Room Designer.
  const second = readinessFor([
    row('v1', 'Level 4 version', READINESS_STATE.CURRENT),
    row('v2', 'Original Design', READINESS_STATE.STALE),
  ]);
  expect(second.primaryAction.versionId).toBe('v2');
});