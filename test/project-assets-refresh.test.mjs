/**
 * DOC-02 — Project Assets and Project Library refresh reliability.
 *
 * Acceptance tests for the pure refresh-coalescing and project-identity state
 * machine shared by useProjectLibraryAssets and useProjectWorkflowAssets.
 *
 * Run: npx vitest run test/project-assets-refresh.test.mjs
 */

import { test, expect } from 'vitest';
import {
  createProjectAssetsRefreshState,
  requestRead,
  onReadEnd,
  consumePendingSilent,
  activeProjectIdOf,
} from '../src/components/library/projectAssetsRefreshState';

/* ── A stored document appears automatically after an active read ──────── */

test('a refresh during an active read is retained, not discarded', () => {
  const state = createProjectAssetsRefreshState();
  // First read starts.
  const r1 = requestRead(state, { projectId: 'A', silent: false });
  expect(r1.shouldRun).toBe(true);
  expect(state.inFlight).toBe(true);

  // A second refresh arrives while the first is still in flight. It must be
  // retained, not discarded — the caller must NOT start a second read.
  const r2 = requestRead(state, { projectId: 'A', silent: true });
  expect(r2.shouldRun).toBe(false);
  expect(state.pending).toBe(true);

  // The active read settles. One follow-up should run.
  const end = onReadEnd(state, { projectId: 'A' });
  expect(end.shouldCommit).toBe(true);
  expect(end.pendingRefresh).toBe(true);
});

/* ── Multiple notifications coalesce into one follow-up ────────────────── */

test('multiple notifications during one read produce one follow-up', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: false });

  // Five notifications arrive while the read is in flight.
  for (let i = 0; i < 5; i++) {
    expect(requestRead(state, { projectId: 'A', silent: true }).shouldRun).toBe(false);
  }
  expect(state.pending).toBe(true);

  const end = onReadEnd(state, { projectId: 'A' });
  expect(end.pendingRefresh).toBe(true);
  expect(state.pending).toBe(false);

  // The single follow-up starts; no further pending remains.
  const followUp = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  expect(followUp.shouldRun).toBe(true);
  expect(state.pending).toBe(false);
  const end2 = onReadEnd(state, { projectId: 'A' });
  expect(end2.pendingRefresh).toBe(false);
});

/* ── A non-silent coalesced request wins ────────────────────────────────── */

test('a non-silent coalesced request makes the follow-up non-silent', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: true }); // initial silent read
  // A non-silent refresh arrives during the silent read.
  requestRead(state, { projectId: 'A', silent: false });
  onReadEnd(state, { projectId: 'A' });
  expect(consumePendingSilent(state)).toBe(false);
});

/* ── An older response never populates a newly selected project ────────── */

test('switching projects while a read is outstanding discards the old result', () => {
  const state = createProjectAssetsRefreshState();
  // Project A's read starts.
  requestRead(state, { projectId: 'A', silent: false });
  expect(activeProjectIdOf(state)).toBe('A');

  // Before A's read completes, the user switches to project B. The new
  // project's load is requested — it coalesces behind the in-flight A read.
  const bRequest = requestRead(state, { projectId: 'B', silent: false });
  expect(bRequest.shouldRun).toBe(false);
  expect(activeProjectIdOf(state)).toBe('B');

  // A's read finally completes. It must NOT commit — B is now active.
  const endA = onReadEnd(state, { projectId: 'A' });
  expect(endA.shouldCommit).toBe(false);
  expect(endA.pendingRefresh).toBe(true);

  // The coalesced follow-up runs for B (the active project), and commits.
  const bFollowUp = requestRead(state, { projectId: 'B', silent: consumePendingSilent(state) });
  expect(bFollowUp.shouldRun).toBe(true);
  const endB = onReadEnd(state, { projectId: 'B' });
  expect(endB.shouldCommit).toBe(true);
});

/* ── An older read cannot clear the loading state of a newer request ──── */

test('an older read does not clear loading for a newer project', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: false });
  // Switch to B before A completes.
  requestRead(state, { projectId: 'B', silent: false });

  // A settles — shouldCommit is false, so the caller does not setLoading(false)
  // for A. The hook's loading state (belonging to B) is preserved.
  const endA = onReadEnd(state, { projectId: 'A' });
  expect(endA.shouldCommit).toBe(false);
});

/* ── A failed read remains recoverable ─────────────────────────────────── */

test('a failed read settles cleanly and allows a follow-up', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: false });
  // A notification arrives during the failed read.
  requestRead(state, { projectId: 'A', silent: true });

  // The read fails (the hook catches the error). onReadEnd still runs.
  const end = onReadEnd(state, { projectId: 'A' });
  expect(end.shouldCommit).toBe(true); // still the active project → may set error
  expect(end.pendingRefresh).toBe(true); // the follow-up recovers

  // The follow-up can succeed.
  const followUp = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  expect(followUp.shouldRun).toBe(true);
  const endFollow = onReadEnd(state, { projectId: 'A' });
  expect(endFollow.shouldCommit).toBe(true);
  expect(endFollow.pendingRefresh).toBe(false);
});

/* ── No repeated refresh loop ──────────────────────────────────────────── */

test('a read with no pending notifications produces no follow-up', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: false });
  const end = onReadEnd(state, { projectId: 'A' });
  expect(end.pendingRefresh).toBe(false);
  expect(state.inFlight).toBe(false);
  expect(state.pending).toBe(false);
});

/* ── Switching design versions preserves project identity ─────────────── */

test('the active project identity is whatever was last requested', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: false });
  expect(activeProjectIdOf(state)).toBe('A');
  // A version switch within the same project does not change project identity.
  requestRead(state, { projectId: 'A', silent: true });
  expect(activeProjectIdOf(state)).toBe('A');
  onReadEnd(state, { projectId: 'A' });
  expect(activeProjectIdOf(state)).toBe('A');
});

/* ── Image and document notifications share one coalesced path ────────── */

test('a document notification and an image notification during one read coalesce', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: false });
  // One notification for a stored PDF, one for a stored image — both during
  // the same active read.
  requestRead(state, { projectId: 'A', silent: true });
  requestRead(state, { projectId: 'A', silent: true });
  expect(state.pending).toBe(true);
  const end = onReadEnd(state, { projectId: 'A' });
  // Only ONE follow-up — both changes are reflected by a single re-read.
  expect(end.pendingRefresh).toBe(true);
});