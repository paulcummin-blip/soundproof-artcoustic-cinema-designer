/**
 * DOC-02 — Request identity, cross-view notifications and read-failure feedback.
 *
 * Acceptance tests verifying:
 *   - The shared issued-export signal delivers image and document change
 *     notifications to every subscribed view (Project Assets, Library,
 *     Proposal Image Gallery).
 *   - The LibraryReadError component renders a Retry action (not an empty
 *     library message) when a read has failed.
 *   - A simulated A→B→A hook sequence with a deliberately delayed first A
 *     response discards the stale response and commits only the current
 *     visit's data.
 *
 * Run: npx vitest run test/project-assets-identity.test.mjs
 */

import { test, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  notifyIssuedExportStored,
  notifyProjectImagesChanged,
  subscribeIssuedExportStored,
} from '../src/components/library/issuedExportSignal';
import {
  createProjectAssetsRefreshState,
  requestRead,
  onReadEnd,
  consumePendingSilent,
  requestCount,
  onCountEnd,
} from '../src/components/library/projectAssetsRefreshState';
import LibraryReadError from '../src/components/library/LibraryReadError.jsx';

/* ── Image deletion notifies all subscribed views ──────────────────────── */

test('notifyProjectImagesChanged fires every subscribed listener', () => {
  const received = [];
  const unsub1 = subscribeIssuedExportStored((pid) => received.push(['view1', pid]));
  const unsub2 = subscribeIssuedExportStored((pid) => received.push(['view2', pid]));

  notifyProjectImagesChanged('proj-A');

  expect(received).toEqual([
    ['view1', 'proj-A'],
    ['view2', 'proj-A'],
  ]);

  unsub1();
  unsub2();
});

test('a listener that throws does not stop the others', () => {
  const received = [];
  subscribeIssuedExportStored(() => { throw new Error('boom'); });
  const unsub = subscribeIssuedExportStored((pid) => received.push(pid));

  notifyIssuedExportStored('proj-B');
  expect(received).toEqual(['proj-B']);

  unsub();
});

test('unsubscribe stops further notifications', () => {
  const received = [];
  const unsub = subscribeIssuedExportStored((pid) => received.push(pid));

  notifyIssuedExportStored('proj-C');
  unsub();
  notifyIssuedExportStored('proj-D');

  expect(received).toEqual(['proj-C']);
});

/* ── Read-failure feedback renders Retry, not an empty library ────────── */

test('LibraryReadError full variant shows a Retry button, not "No … yet"', () => {
  const html = renderToStaticMarkup(
    React.createElement(LibraryReadError, { onRetry: () => {} }),
  );
  expect(html).toContain('Retry');
  expect(html).not.toContain('No proposal assets yet');
  expect(html).not.toContain('No design versions yet');
});

test('LibraryReadError banner variant shows a compact retry banner', () => {
  const html = renderToStaticMarkup(
    React.createElement(LibraryReadError, { onRetry: () => {}, variant: 'banner' }),
  );
  expect(html).toContain('Retry');
  expect(html).toContain('could not be loaded');
  expect(html).toContain('role="alert"');
});

test('LibraryReadError does not show "0 images" on a failed read', () => {
  const html = renderToStaticMarkup(
    React.createElement(LibraryReadError, { onRetry: () => {} }),
  );
  expect(html).not.toContain('0 images');
  expect(html).not.toContain('image'); // no empty-gallery message
});

/* ── Simulated A→B→A hook sequence with delayed first A response ──────── */

test('A→B→A with delayed first A: stale A response is discarded, current visit commits', async () => {
  // Simulate the exact call sequence useProjectWorkflowAssets runs,
  // with controllable async resolution order.
  const state = createProjectAssetsRefreshState();
  let committedProject = null;
  let committedGeneration = null;

  // A helper that mimics what the hook does: capture generation, await, then
  // check identity on settle.
  async function simulateRead(projectId, silent, resolveAfter) {
    const { shouldRun, generation } = requestRead(state, { projectId, silent });
    if (!shouldRun) return;
    await resolveAfter();
    const { shouldCommit } = onReadEnd(state, { projectId, generation });
    if (shouldCommit) {
      committedProject = projectId;
      committedGeneration = generation;
    }
  }

  // 1. First visit to A: read starts (generation 1). The response is delayed.
  let resolveA1;
  const readA1 = simulateRead('A', false, () => new Promise((res) => { resolveA1 = res; }));

  // 2. Switch to B: coalesced (generation bumps to 2).
  // 3. Switch back to A: coalesced (generation bumps to 3).
  requestRead(state, { projectId: 'B', silent: false });
  requestRead(state, { projectId: 'A', silent: false });
  expect(state.generation).toBe(3);
  expect(state.activeProjectId).toBe('A');

  // 4. The delayed first A response arrives. It must NOT commit.
  resolveA1();
  await readA1;
  expect(committedProject).toBe(null); // stale A1 was discarded

  // 5. The coalesced follow-up runs for A (generation 3+).
  const followUp = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  expect(followUp.shouldRun).toBe(true);
  expect(followUp.generation).toBe(3);

  // 6. Follow-up settles — commits.
  const endFollow = onReadEnd(state, { projectId: 'A', generation: followUp.generation });
  expect(endFollow.shouldCommit).toBe(true);
  expect(committedProject).toBe(null); // simulateRead didn't run the follow-up
  // But the state machine confirms it WOULD commit:
  expect(state.activeProjectId).toBe('A');
  expect(state.generation).toBe(3);
});

/* ── Five notifications produce bounded coalesced refresh requests ────── */

test('five notifications during a read produce exactly one follow-up read', () => {
  const state = createProjectAssetsRefreshState();
  const r0 = requestRead(state, { projectId: 'A', silent: false });

  let followUpCount = 0;
  for (let i = 0; i < 5; i++) {
    requestRead(state, { projectId: 'A', silent: true });
  }
  expect(state.pending).toBe(true);

  const end = onReadEnd(state, { projectId: 'A', generation: r0.generation });
  expect(end.pendingRefresh).toBe(true);

  // The hook runs ONE follow-up.
  const r1 = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  if (r1.shouldRun) followUpCount++;
  onReadEnd(state, { projectId: 'A', generation: r1.generation });

  expect(followUpCount).toBe(1);
  expect(state.pending).toBe(false);
});

test('five count notifications produce one follow-up when counts are requested', () => {
  // When the section is collapsed (not enabled), the hook calls requestCount
  // on each notification. The state machine coalesces five into one follow-up.
  const state = createProjectAssetsRefreshState();
  const c0 = requestCount(state, { projectId: 'A' });

  let followUpCount = 0;
  for (let i = 0; i < 5; i++) {
    requestCount(state, { projectId: 'A' });
  }
  expect(state.countPending).toBe(true);

  const end = onCountEnd(state, { projectId: 'A', generation: c0.generation });
  expect(end.pendingRefresh).toBe(true);

  // One follow-up count runs.
  const c1 = requestCount(state, { projectId: 'A' });
  if (c1.shouldRun) followUpCount++;
  onCountEnd(state, { projectId: 'A', generation: c1.generation });

  expect(followUpCount).toBe(1);
  expect(state.countPending).toBe(false);
});

test('when enabled, notifications trigger reads not separate counts', () => {
  // When the section is expanded (enabled), the hook calls load (requestRead)
  // on notifications, not refreshCounts — the full read derives counts on
  // completion. Five notifications produce five requestRead calls, all of
  // which coalesce into one follow-up read. No requestCount is called.
  const state = createProjectAssetsRefreshState();
  const r0 = requestRead(state, { projectId: 'A', silent: false });

  for (let i = 0; i < 5; i++) {
    requestRead(state, { projectId: 'A', silent: true });
  }
  expect(state.pending).toBe(true);
  expect(state.countInFlight).toBe(false); // no count was started

  const end = onReadEnd(state, { projectId: 'A', generation: r0.generation });
  expect(end.pendingRefresh).toBe(true);

  // One follow-up read runs; it derives the counts.
  const r1 = requestRead(state, { projectId: 'A', silent: consumePendingSilent(state) });
  expect(r1.shouldRun).toBe(true);
  onReadEnd(state, { projectId: 'A', generation: r1.generation });
  expect(state.countInFlight).toBe(false); // still no separate count
});

/* ── Obsolete responses cannot change counts or loading state ──────────── */

test('an obsolete count from an earlier visit does not update counts', () => {
  const state = createProjectAssetsRefreshState();
  const cA = requestCount(state, { projectId: 'A' });

  // Switch to B and back to A.
  requestRead(state, { projectId: 'B', silent: false });
  requestRead(state, { projectId: 'A', silent: false });
  expect(state.generation).toBe(3);

  // A's count settles — generation mismatch → discarded.
  const endA = onCountEnd(state, { projectId: 'A', generation: cA.generation });
  expect(endA.shouldCommit).toBe(false);

  // The follow-up count for the current visit commits.
  const cFollow = requestCount(state, { projectId: 'A' });
  const endFollow = onCountEnd(state, { projectId: 'A', generation: cFollow.generation });
  expect(endFollow.shouldCommit).toBe(true);
});