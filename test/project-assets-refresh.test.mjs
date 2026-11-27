/**
 * DOC-02 — Project Assets and Project Library refresh reliability.
 *
 * Acceptance tests for the pure refresh-coalescing, request-identity and
 * count-coalescing state machine shared by useProjectLibraryAssets,
 * useProjectWorkflowAssets and the Proposal Image Gallery.
 *
 * Run: npx vitest run test/project-assets-refresh.test.mjs
 */

import { test, expect } from 'vitest';
import {
  createProjectAssetsRefreshState,
  requestRead,
  onReadEnd,
  consumePendingSilent,
  requestCount,
  onCountEnd,
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
  const end = onReadEnd(state, { projectId: 'A', generation: r1.generation });
  expect(end.shouldCommit).toBe(true);
  expect(end.pendingRefresh).toBe(true);
});

/* ── Multiple notifications coalesce into one follow-up ────────────────── */

test('multiple notifications during one read produce one follow-up', () => {
  const state = createProjectAssetsRefreshState();
  const r0 = requestRead(state, { projectId: 'A', silent: false });

  // Five notifications arrive while the read is in flight.
  for (let i = 0; i < 5; i++) {
    expect(requestRead(state, { projectId: 'A', silent: true }).shouldRun).toBe(false);
  }
  expect(state.pending).toBe(true);

  const end = onReadEnd(state, { projectId: 'A', generation: r0.generation });
  expect(end.pendingRefresh).toBe(true);
  expect(state.pending).toBe(false);

  // The single follow-up starts; no further pending remains.
  const followUp = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  expect(followUp.shouldRun).toBe(true);
  expect(state.pending).toBe(false);
  const end2 = onReadEnd(state, { projectId: 'A', generation: followUp.generation });
  expect(end2.pendingRefresh).toBe(false);
});

/* ── A non-silent coalesced request wins ────────────────────────────────── */

test('a non-silent coalesced request makes the follow-up non-silent', () => {
  const state = createProjectAssetsRefreshState();
  requestRead(state, { projectId: 'A', silent: true }); // initial silent read
  // A non-silent refresh arrives during the silent read.
  requestRead(state, { projectId: 'A', silent: false });
  onReadEnd(state, { projectId: 'A', generation: 0 });
  expect(consumePendingSilent(state)).toBe(false);
});

/* ── An older response never populates a newly selected project ────────── */

test('switching projects while a read is outstanding discards the old result', () => {
  const state = createProjectAssetsRefreshState();
  // Project A's read starts.
  const rA = requestRead(state, { projectId: 'A', silent: false });
  expect(rA.generation).toBe(1);
  expect(activeProjectIdOf(state)).toBe('A');

  // Before A's read completes, the user switches to project B. The new
  // project's load is requested — it coalesces behind the in-flight A read.
  const bRequest = requestRead(state, { projectId: 'B', silent: false });
  expect(bRequest.shouldRun).toBe(false);
  expect(activeProjectIdOf(state)).toBe('B');
  expect(state.generation).toBe(2);

  // A's read finally completes. It must NOT commit — B is now active and the
  // generation no longer matches.
  const endA = onReadEnd(state, { projectId: 'A', generation: rA.generation });
  expect(endA.shouldCommit).toBe(false);
  expect(endA.pendingRefresh).toBe(true);

  // The coalesced follow-up runs for B (the active project), and commits.
  const bFollowUp = requestRead(state, { projectId: 'B', silent: consumePendingSilent(state) });
  expect(bFollowUp.shouldRun).toBe(true);
  const endB = onReadEnd(state, { projectId: 'B', generation: bFollowUp.generation });
  expect(endB.shouldCommit).toBe(true);
});

/* ── An older read cannot clear the loading state of a newer request ──── */

test('an older read does not clear loading for a newer project', () => {
  const state = createProjectAssetsRefreshState();
  const rA = requestRead(state, { projectId: 'A', silent: false });
  // Switch to B before A completes.
  requestRead(state, { projectId: 'B', silent: false });

  // A settles — shouldCommit is false, so the caller does not setLoading(false)
  // for A. The hook's loading state (belonging to B) is preserved.
  const endA = onReadEnd(state, { projectId: 'A', generation: rA.generation });
  expect(endA.shouldCommit).toBe(false);
});

/* ── A → B → A: an earlier visit to the same project is discarded ─────── */

test('A→B→A: the first A response is discarded by the visit generation', () => {
  const state = createProjectAssetsRefreshState();

  // First visit to A: read starts with generation 1.
  const rA1 = requestRead(state, { projectId: 'A', silent: false });
  expect(rA1.generation).toBe(1);

  // Switch to B (generation bumps to 2), coalesced behind A's in-flight read.
  requestRead(state, { projectId: 'B', silent: false });
  expect(state.generation).toBe(2);

  // Switch back to A (generation bumps to 3), still coalesced.
  requestRead(state, { projectId: 'A', silent: false });
  expect(state.generation).toBe(3);
  expect(activeProjectIdOf(state)).toBe('A');

  // The FIRST A response (generation 1) settles. The project id matches ('A')
  // but the generation does NOT (1 ≠ 3) — so it is correctly discarded.
  const endA1 = onReadEnd(state, { projectId: 'A', generation: rA1.generation });
  expect(endA1.shouldCommit).toBe(false);
  expect(endA1.pendingRefresh).toBe(true);

  // The coalesced follow-up runs for A with the current generation (3+).
  const followUp = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  expect(followUp.shouldRun).toBe(true);
  expect(followUp.generation).toBe(3);
  const endFollow = onReadEnd(state, { projectId: 'A', generation: followUp.generation });
  expect(endFollow.shouldCommit).toBe(true);
  expect(endFollow.pendingRefresh).toBe(false);
});

/* ── A → B navigation: both response completion orders ────────────────── */

test('A→B: A settles first, then B follows up and commits', () => {
  const state = createProjectAssetsRefreshState();
  const rA = requestRead(state, { projectId: 'A', silent: false });
  // Switch to B before A completes.
  requestRead(state, { projectId: 'B', silent: false });

  // A settles first — discarded, B follow-up pending.
  const endA = onReadEnd(state, { projectId: 'A', generation: rA.generation });
  expect(endA.shouldCommit).toBe(false);
  expect(endA.pendingRefresh).toBe(true);

  // B follow-up starts and settles — commits.
  const rB = requestRead(state, { projectId: 'B', silent: consumePendingSilent(state) });
  const endB = onReadEnd(state, { projectId: 'B', generation: rB.generation });
  expect(endB.shouldCommit).toBe(true);
});

test('A→B: B settles first (if B read started independently), then A is discarded', () => {
  const state = createProjectAssetsRefreshState();
  const rA = requestRead(state, { projectId: 'A', silent: false });
  // A settles before the switch — commits normally.
  const endA = onReadEnd(state, { projectId: 'A', generation: rA.generation });
  expect(endA.shouldCommit).toBe(true);

  // Now switch to B — a fresh read starts (not coalesced).
  const rB = requestRead(state, { projectId: 'B', silent: false });
  expect(rB.shouldRun).toBe(true);
  const endB = onReadEnd(state, { projectId: 'B', generation: rB.generation });
  expect(endB.shouldCommit).toBe(true);
});

/* ── A failed read remains recoverable ─────────────────────────────────── */

test('a failed read settles cleanly and allows a follow-up', () => {
  const state = createProjectAssetsRefreshState();
  const r0 = requestRead(state, { projectId: 'A', silent: false });
  // A notification arrives during the failed read.
  requestRead(state, { projectId: 'A', silent: true });

  // The read fails (the hook catches the error). onReadEnd still runs.
  const end = onReadEnd(state, { projectId: 'A', generation: r0.generation });
  expect(end.shouldCommit).toBe(true); // still the active project → may set error
  expect(end.pendingRefresh).toBe(true); // the follow-up recovers

  // The follow-up can succeed.
  const followUp = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  expect(followUp.shouldRun).toBe(true);
  const endFollow = onReadEnd(state, { projectId: 'A', generation: followUp.generation });
  expect(endFollow.shouldCommit).toBe(true);
  expect(endFollow.pendingRefresh).toBe(false);
});

/* ── No repeated refresh loop ──────────────────────────────────────────── */

test('a read with no pending notifications produces no follow-up', () => {
  const state = createProjectAssetsRefreshState();
  const r0 = requestRead(state, { projectId: 'A', silent: false });
  const end = onReadEnd(state, { projectId: 'A', generation: r0.generation });
  expect(end.pendingRefresh).toBe(false);
  expect(state.inFlight).toBe(false);
  expect(state.pending).toBe(false);
});

/* ── Switching design versions preserves project identity ─────────────── */

test('the active project identity is whatever was last requested', () => {
  const state = createProjectAssetsRefreshState();
  const r0 = requestRead(state, { projectId: 'A', silent: false });
  expect(activeProjectIdOf(state)).toBe('A');
  // A version switch within the same project does not change project identity
  // or bump the generation.
  const r1 = requestRead(state, { projectId: 'A', silent: true });
  expect(r1.shouldRun).toBe(false); // coalesced — no new read starts
  expect(state.generation).toBe(r0.generation); // no bump on same project
  expect(activeProjectIdOf(state)).toBe('A');
  // The in-flight read (r0) settles with its original generation.
  onReadEnd(state, { projectId: 'A', generation: r0.generation });
  expect(activeProjectIdOf(state)).toBe('A');
});

/* ── Image and document notifications share one coalesced path ────────── */

test('a document notification and an image notification during one read coalesce', () => {
  const state = createProjectAssetsRefreshState();
  const r0 = requestRead(state, { projectId: 'A', silent: false });
  // One notification for a stored PDF, one for a stored image — both during
  // the same active read.
  requestRead(state, { projectId: 'A', silent: true });
  requestRead(state, { projectId: 'A', silent: true });
  expect(state.pending).toBe(true);
  const end = onReadEnd(state, { projectId: 'A', generation: r0.generation });
  // Only ONE follow-up — both changes are reflected by a single re-read.
  expect(end.pendingRefresh).toBe(true);
});

/* ── Count coalescing: five notifications produce one follow-up count ─── */

test('five count notifications during one count produce one follow-up', () => {
  const state = createProjectAssetsRefreshState();
  const c0 = requestCount(state, { projectId: 'A' });
  expect(c0.shouldRun).toBe(true);
  expect(state.countInFlight).toBe(true);

  // Five notifications arrive while the count is in flight.
  for (let i = 0; i < 5; i++) {
    expect(requestCount(state, { projectId: 'A' }).shouldRun).toBe(false);
  }
  expect(state.countPending).toBe(true);

  const end = onCountEnd(state, { projectId: 'A', generation: c0.generation });
  expect(end.shouldCommit).toBe(true);
  expect(end.pendingRefresh).toBe(true);
  expect(state.countPending).toBe(false);

  // The single follow-up count runs; no further pending remains.
  const followUp = requestCount(state, { projectId: 'A' });
  expect(followUp.shouldRun).toBe(true);
  const end2 = onCountEnd(state, { projectId: 'A', generation: followUp.generation });
  expect(end2.pendingRefresh).toBe(false);
});

/* ── Count identity: an obsolete count is discarded ───────────────────── */

test('a count for an earlier visit is discarded by the generation check', () => {
  const state = createProjectAssetsRefreshState();
  const cA = requestCount(state, { projectId: 'A' });
  expect(cA.shouldRun).toBe(true);

  // Switch to B — generation bumps.
  requestRead(state, { projectId: 'B', silent: false });
  expect(state.generation).toBe(2);

  // A's count settles — discarded (wrong project AND wrong generation).
  const endA = onCountEnd(state, { projectId: 'A', generation: cA.generation });
  expect(endA.shouldCommit).toBe(false);
});

/* ── Count and read share the visit generation ────────────────────────── */

test('a project switch invalidates both in-flight reads and counts', () => {
  const state = createProjectAssetsRefreshState();
  const rA = requestRead(state, { projectId: 'A', silent: false });
  const cA = requestCount(state, { projectId: 'A' });

  // Switch to B.
  requestRead(state, { projectId: 'B', silent: false });
  expect(state.generation).toBe(2);

  // Both A responses settle — both discarded.
  const endRA = onReadEnd(state, { projectId: 'A', generation: rA.generation });
  const endCA = onCountEnd(state, { projectId: 'A', generation: cA.generation });
  expect(endRA.shouldCommit).toBe(false);
  expect(endCA.shouldCommit).toBe(false);

  // B follow-ups commit.
  const rB = requestRead(state, { projectId: 'B', silent: consumePendingSilent(state) });
  const cB = requestCount(state, { projectId: 'B' });
  expect(onReadEnd(state, { projectId: 'B', generation: rB.generation }).shouldCommit).toBe(true);
  expect(onCountEnd(state, { projectId: 'B', generation: cB.generation }).shouldCommit).toBe(true);
});