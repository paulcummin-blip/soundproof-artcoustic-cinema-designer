// bass-domain-blocker-filter.test.mjs
// -----------------------------------
// Acceptance tests for the Subwoofer Design panel's domain rule.
//
// The bass band may name a blocker only inside the bass domain:
//
//   A / F  P4 (or any other non-bass parameter) blocking the overall
//          engineering publication → the bass band does NOT name it. The
//          completed bass result stays current and the panel states the overall
//          position: "Overall design assessment is not yet complete."
//   B      P14 incomplete → the bass band may name P14.
//   C      P18 incomplete → the bass band may name P18.
//   D      P19 incomplete → the bass band may name P19.
//   E      P20 incomplete → the bass band may name P20.
//
// A bass-domain GATE that names no parameter (for example a bass identity that
// has not settled) keeps the bass attention status: the panel must never claim
// the bass result is current while a bass fact is unresolved.
// ---------------------------------------------------------------------------

import { test, expect } from 'vitest';

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

const {
  resolveBassAuthorityState,
  bassDomainBlockNote,
  hasBassDomainBlocker,
} = await import('../components/room/bass/bassAuthorityState.js');

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

const blockedBy = (attempt) => resolveBassAuthorityState({
  ...currentAuthority,
  publicationAttempt: { status: 'failed', fingerprint: 'eng:a', ...attempt },
});

const gate = (key, label, detail = null) => ({ key, label, detail, ok: false });

test('A / F — a non-bass blocker never names a parameter inside the bass band', () => {
  const p4 = blockedBy({
    message: 'The saved assessment is incomplete (engineering_summary.p4 is not terminal, parameter_index.P4.level is not a terminal published result).',
    missing: [{ key: 'engineering_summary.p4', label: 'engineering_summary.p4' }],
    gates: [gate('rp22_terminal', 'RP22 P1–P21 terminal (verified bass or explicit N/A)', 'p4, p16')],
  });

  expect(p4.label).toBe('Performance Current');
  expect(p4.note).toBe('Overall design assessment is not yet complete.');
  expect(p4.message).toBeNull();
  expect(p4.attention).not.toBe(true);
  expect(JSON.stringify(p4)).not.toMatch(/\bP\d+\b/);
});

test('F — every non-bass parameter is filtered out of the named blocker', () => {
  const nonBass = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 21];
  nonBass.forEach((parameter) => {
    const attempt = {
      missing: [{ key: `engineering_summary.p${parameter}`, label: `engineering_summary.p${parameter}` }],
      message: `The saved assessment is incomplete (engineering_summary.p${parameter} is not terminal).`,
    };
    expect(bassDomainBlockNote(attempt)).toBeNull();
    expect(hasBassDomainBlocker(attempt)).toBe(false);
  });
});

test('B — an incomplete P14 is named', () => {
  const state = blockedBy({
    missing: [{ key: 'engineering_summary.p14', label: 'engineering_summary.p14' }],
    gates: [gate('rp22_terminal', 'RP22 P1–P21 terminal (verified bass or explicit N/A)', 'p14')],
  });
  expect(state.label).toBe('Assessment needs attention');
  expect(state.message).toBe('P14 assessment needs updating.');
  expect(state.actionLabel).toBe('Save Assessment');
  expect(state.attention).toBe(true);
});

test('C — an incomplete P18 is named', () => {
  const state = blockedBy({
    gates: [gate('rp22_terminal', 'RP22 P1–P21 terminal (verified bass or explicit N/A)', 'p4, p18')],
  });
  expect(state.message).toBe('P18 assessment needs updating.');
  expect(state.label).toBe('Assessment needs attention');
});

test('D — an unresolved P19 is named from the bass gate itself', () => {
  const state = blockedBy({
    gates: [gate('bass_current', 'Current verified bass / P19', 'not-verified')],
  });
  expect(state.message).toBe('P19 assessment needs updating.');
  expect(state.attention).toBe(true);
});

test('E — missing P20 seat results are named from the bass gate itself', () => {
  const state = blockedBy({
    gates: [gate('p20_available', 'P20 seat results available')],
  });
  expect(state.message).toBe('P20 assessment needs updating.');
  expect(state.attention).toBe(true);
});

test('a mixed blocker names the bass-domain parameter, never the non-bass one', () => {
  const state = blockedBy({
    missing: [{ key: 'engineering_summary.p4', label: 'engineering_summary.p4' }],
    gates: [
      gate('rp22_terminal', 'RP22 P1–P21 terminal (verified bass or explicit N/A)', 'p4, p18'),
      gate('spl_authority', 'the SPL authority (P12, P13)', null),
    ],
  });
  expect(state.message).toBe('P18 assessment needs updating.');
  expect(JSON.stringify(state)).not.toMatch(/P4\b/);
});

test('a bass-domain gate with no nameable parameter keeps the bass attention status', () => {
  const state = blockedBy({
    // No parameter number anywhere: a bass identity that has not settled.
    gates: [gate('bass_identity', 'Completed bass assessment matches the selected target', 'Wait for the selected target assessment to settle, then retry.')],
  });
  expect(state.label).toBe('Assessment needs attention');
  expect(state.message).toBe('This assessment needs updating before it can be saved.');
  expect(state.note).toBeUndefined();
  expect(state.attention).toBe(true);
});

test('a not-ready attempt is filtered by the same domain rule', () => {
  const state = resolveBassAuthorityState({
    ...currentAuthority,
    publicationAttempt: {
      status: 'not_ready',
      fingerprint: 'eng:a',
      message: 'Not ready: RP22 P1–P21 terminal: p4',
      gates: [gate('rp22_terminal', 'RP22 P1–P21 terminal (verified bass or explicit N/A)', 'p4')],
    },
  });
  expect(state.label).toBe('Performance Current');
  expect(state.note).toBe('Overall design assessment is not yet complete.');
});