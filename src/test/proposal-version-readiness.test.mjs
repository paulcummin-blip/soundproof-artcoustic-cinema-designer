// proposal-version-readiness.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — per-version proposal readiness, named blockers and the Proposal
// Library's revision/source behaviour.
//
//   TEST 1  A comparison is judged per version, never from the first version
//   TEST 2  Every version current = ready, with the ready copy
//   TEST 3  The version count the report type requires is part of readiness
//   TEST 4  A read in flight reads Checking and blocks nothing yet
//   TEST 5  The blocking message names every blocked version and its source
//   TEST 6  Step 3 warns with the table; only Next blocks
//   TEST 7  Step 5 shows the same table and gates the Generate button
//   TEST 8  The server states the same clauses and names the same blockers
//   TEST 9  The Proposal Library groups by project
//   TEST 10 Current / Source changed / Missing source
//   TEST 11 Regeneration creates a linked revision; the original is untouched
// ---------------------------------------------------------------------------
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  PROPOSAL_READINESS_READY_COPY,
  PROPOSAL_READINESS_TITLE,
  READINESS_COLUMNS,
  READINESS_STATE,
  buildReadinessCell,
  resolveProposalReadinessGate,
  resolveVersionReadinessRow,
  versionDisplayName,
} from '../components/proposal/sourceAuthority/proposalReadinessAuthority.js';
import {
  PROPOSAL_LIBRARY_SOURCE_LABEL,
  PROPOSAL_LIBRARY_SOURCE_STATE,
  groupProposalsByProject,
  proposalVersionIds,
  resolveProposalSourceState,
} from '../components/proposal/library/proposalSourceState.js';
import { revisionLabel } from '../components/proposal/library/RevisionBadge.jsx';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const WIZARD = read('src/components/proposal/CreateProposalWizard.jsx');
const VERSIONS_STEP = read('src/components/proposal/wizard/VersionSelectStep.jsx');
const TABLE = read('src/components/proposal/sourceAuthority/VersionReadinessTable.jsx');
const TAB = read('src/components/proposal/library/ProposalLibraryTab.jsx');
const GROUP = read('src/components/proposal/library/ProposalLibraryGroup.jsx');
const ACTIONS = read('src/components/proposal/library/ProposalLibraryActions.jsx');
const CENTRE = read('src/pages/ProposalCentre.jsx');
const SERVER = read('base44/functions/generateProposal/entry.ts');

const current = (generatedAt = '2026-10-01T09:00:00.000Z') =>
  buildReadinessCell({ state: READINESS_STATE.CURRENT, generatedAt });
const missing = () => buildReadinessCell({ state: READINESS_STATE.MISSING });
const stale = () => buildReadinessCell({ state: READINESS_STATE.STALE });
const checking = () => buildReadinessCell({ state: READINESS_STATE.CHECKING });

const readyRow = (versionId, versionName, versionNumber) => resolveVersionReadinessRow({
  versionId,
  versionName,
  versionNumber,
  cells: { visual: current(), technical: current(), engineering: current() },
});

/* ── TEST 1 — a comparison is judged per version ───────────────────────── */

test('TEST 1 — a comparison is judged per version, never from the first selected version', () => {
  const ready = readyRow('v1', 'Original Design', 1);
  const blocked = resolveVersionReadinessRow({
    versionId: 'v2',
    versionName: 'Level 4 version',
    versionNumber: 2,
    cells: { visual: current(), technical: missing(), engineering: current() },
  });
  const gate = resolveProposalReadinessGate({ rows: [ready, blocked], minVersions: 2 });

  expect(ready.ready).toBe(true);
  expect(gate.ready).toBe(false);
  expect(gate.rows).toHaveLength(2);
  expect(gate.blockers).toHaveLength(1);
  expect(gate.blockers[0].source).toBe('technical');
  expect(gate.message).toContain('Level 4 version is missing the Technical Report');
  expect(gate.message).not.toContain('Original Design');
});

/* ── TEST 2 — all versions current ────────────────────────────────────── */

test('TEST 2 — every selected version current reads ready, with the ready copy', () => {
  const rows = [readyRow('v1', 'Original Design', 1), readyRow('v2', 'Level 4 version', 2)];
  const gate = resolveProposalReadinessGate({ rows, minVersions: 2, maxVersions: 3 });

  expect(gate.available).toBe(true);
  expect(gate.checking).toBe(false);
  expect(gate.versionCountValid).toBe(true);
  expect(gate.ready).toBe(true);
  expect(gate.message).toBeNull();
  expect(gate.detail).toBe(PROPOSAL_READINESS_READY_COPY);
  expect(gate.detail).toContain('Every selected version has its current reports');
  expect(rows.every((row) => row.visual.status === 'Current')).toBe(true);
});

/* ── TEST 3 — the version count ───────────────────────────────────────── */

test('TEST 3 — the version count the report type requires is part of readiness', () => {
  const gate = resolveProposalReadinessGate({
    rows: [readyRow('v1', 'Original Design', 1)],
    minVersions: 2,
  });

  expect(gate.versionCountValid).toBe(false);
  expect(gate.ready).toBe(false);
  // The count is the block, so no source is named missing: the table states the
  // count requirement and the wizard keeps its own copy for this case.
  expect(gate.message).toBeNull();
  expect(gate.blockedVersions).toEqual([]);
  expect(TABLE).toContain('Select the number of versions this report type requires');
});

/* ── TEST 4 — a read in flight ────────────────────────────────────────── */

test('TEST 4 — a read in flight reads Checking, and nothing is reported as missing', () => {
  const row = resolveVersionReadinessRow({
    versionId: 'v1',
    versionName: 'Original Design',
    versionNumber: 1,
    cells: { visual: checking(), technical: checking(), engineering: checking() },
  });
  const gate = resolveProposalReadinessGate({ rows: [row] });

  expect(gate.checking).toBe(true);
  expect(gate.ready).toBe(false);
  expect(gate.message).toBeNull();
  expect(row.blockers).toEqual([]);
  expect(row.visual.status).toBe('Checking…');
  expect(TABLE).toContain('Checking each selected version’s current reports…');
});

/* ── TEST 5 — named blocking messages ─────────────────────────────────── */

test('TEST 5 — the blocking message names every blocked version and the source that blocks it', () => {
  const rows = [
    readyRow('v1', 'Original Design', 1),
    resolveVersionReadinessRow({
      versionId: 'v2',
      versionName: 'Level 4 version',
      versionNumber: 2,
      cells: { visual: current(), technical: missing(), engineering: current() },
    }),
    resolveVersionReadinessRow({
      versionId: 'v3',
      versionName: 'Wides trial',
      versionNumber: 3,
      cells: { visual: current(), technical: current(), engineering: stale() },
    }),
  ];
  const gate = resolveProposalReadinessGate({ rows, minVersions: 2 });

  expect(gate.message).toBe(
    'Level 4 version is missing the Technical Report. Wides trial has a stale bass authority.',
  );
  expect(gate.blockers.map((blocker) => blocker.sentence)).toEqual([
    'Level 4 version is missing the Technical Report',
    'Wides trial has a stale bass authority',
  ]);
  // The engine column names what is actually missing, never a generic phrase.
  expect(gate.blockers[1].label).toBe('bass authority');
  expect(rows[0].blockingSentence).toBeNull();
});

/* ── TEST 6 — Step 3 warns, Next blocks ───────────────────────────────── */

test('TEST 6 — Step 3 warns with the per-version table, and only Next blocks the step', () => {
  expect(VERSIONS_STEP).toContain("import VersionReadinessTable from '@/components/proposal/sourceAuthority/VersionReadinessTable'");
  expect(VERSIONS_STEP).toContain('<VersionReadinessTable gate={readiness} projectId={projectId} />');
  // The version choice itself is never interrupted.
  expect(WIZARD).toContain('versionsValid, // step 2');
  expect(VERSIONS_STEP).not.toMatch(/disabled=\{!readiness/);
  // The hard block lands when the step is left, naming the blocked versions.
  expect(WIZARD).toContain('if (step === 2 && versionsValid && !readiness.ready) {');
  expect(WIZARD).toContain('setBlockedAttempt(true);');
  expect(WIZARD).toContain("{readiness.message || 'Fix the blocked versions below to continue.'}");
});

/* ── TEST 7 — Step 5 table and Generate ───────────────────────────────── */

test('TEST 7 — Step 5 shows the same table, every version by name, and gates Generate', () => {
  expect(WIZARD).toContain('<VersionReadinessTable');
  expect(WIZARD).toContain('gate={readiness}');
  expect(WIZARD).toContain('label="Versions"');
  expect(WIZARD).toContain('values={readinessRows.length > 0');
  expect(WIZARD).toContain('readinessRows.map((row) => row.versionName)');
  // Generate is disabled while any selected version is not ready…
  expect(WIZARD).toContain('|| !readiness.ready}');
  // …and refuses to run without it, showing the named message.
  expect(WIZARD).toContain('if (!readiness.ready) {');
  expect(WIZARD).toContain('Every selected version needs its current reports before this proposal can be generated.');

  // The table states the three columns and the reported state of each.
  expect(READINESS_COLUMNS.map((column) => column.label)).toEqual([
    'Visual Report',
    'Technical Report',
    'Engineering Authority',
  ]);
  expect(PROPOSAL_READINESS_TITLE).toBe('Version readiness');
  expect(TABLE).toContain('{PROPOSAL_READINESS_TITLE}');
  expect(TABLE).toContain('{row.versionName}');
  expect(TABLE).toContain('{gate.message}');
  expect(TABLE).toContain('READINESS_COLUMNS.map');
});

/* ── TEST 8 — the server agrees ───────────────────────────────────────── */

test('TEST 8 — the server states the same clauses and returns named per-version blockers', () => {
  // The wording now lives in ONE module: the server imports the same shared
  // authority the client mirrors, so the clauses cannot drift apart, and both
  // sides state the block per version and per source.
  expect(SERVER).toContain("} from '../../shared/proposalReadinessAuthority.js';");
  expect(SERVER).toContain('resolveProposalReadinessGate({ rows: readinessRows, minVersions: 1 })');
  expect(SERVER).toContain('error: readinessGate.message || PROPOSAL_SOURCE_REQUIRED_MESSAGE,');
  expect(SERVER).toContain('source_blockers: readinessGate.rows');
  expect(SERVER).toContain('version_name: row.versionName,');
});

/* ── TEST 9 — the library groups by project ───────────────────────────── */

test('TEST 9 — the Proposal Library groups proposals by project', () => {
  const projects = new Map([
    ['p1', { id: 'p1', name: 'Marquee Home' }],
    ['p2', { id: 'p2', name: 'Lords Hall' }],
  ]);
  const groups = groupProposalsByProject([
    { id: 'a', project_id: 'p1', updated_date: '2026-10-01T10:00:00.000Z' },
    { id: 'b', project_id: 'p1', updated_date: '2026-10-03T10:00:00.000Z' },
    { id: 'c', project_id: 'p2', updated_date: '2026-09-01T10:00:00.000Z' },
  ], projects);

  // One group per project, most recently updated first.
  expect(groups.map((group) => group.projectName)).toEqual(['Marquee Home', 'Lords Hall']);
  // Newest proposal first inside a group; no proposal is duplicated or dropped.
  expect(groups[0].proposals.map((proposal) => proposal.id)).toEqual(['b', 'a']);
  expect(groups.flatMap((group) => group.proposals).map((proposal) => proposal.id).sort())
    .toEqual(['a', 'b', 'c']);
  // A proposal whose project cannot be read is still listed, never hidden.
  expect(groupProposalsByProject([{ id: 'd', project_id: 'p9' }], projects)[0].projectName)
    .toBe('Unlinked project');

  expect(TAB).toContain('<ProposalLibraryGroup');
  expect(GROUP).toContain('data-proposal-library-group={group.projectId}');
  expect(GROUP).toContain('{group.projectName}');
  expect(GROUP).toContain('{group.proposals.length}');
});

/* ── TEST 10 — the source state ───────────────────────────────────────── */

const snapshot = (fingerprint) => ({ source_fingerprints: { engineeringFingerprint: fingerprint } });

test('TEST 10 — a saved proposal reads Current, Source changed or Missing source', () => {
  const versionsById = new Map([
    ['v1', { id: 'v1', version_name: 'Original Design', version_number: 1, published_fingerprint: 'fp-1' }],
    ['v2', { id: 'v2', version_name: 'Level 4 version', version_number: 2, published_fingerprint: 'fp-2' }],
  ]);
  const currentReports = new Map([
    ['v1', { visual: snapshot('fp-1'), technical: snapshot('fp-1') }],
    ['v2', { visual: snapshot('fp-2'), technical: snapshot('fp-2') }],
  ]);

  const currentState = resolveProposalSourceState({
    proposal: { id: 'a', selected_version_ids: ['v1'] },
    versionsById,
    savedReportsByVersionId: currentReports,
  });
  expect(currentState.state).toBe(PROPOSAL_LIBRARY_SOURCE_STATE.CURRENT);
  expect(currentState.label).toBe('Current');
  expect(currentState.reason).toBeNull();

  // v2's reports were regenerated after this proposal was written.
  const movedReports = new Map([
    ['v1', { visual: snapshot('fp-1'), technical: snapshot('fp-1') }],
    ['v2', { visual: snapshot('fp-0'), technical: snapshot('fp-0') }],
  ]);
  const changed = resolveProposalSourceState({
    proposal: { id: 'b', selected_version_ids: ['v1', 'v2'] },
    versionsById,
    savedReportsByVersionId: movedReports,
  });
  expect(changed.state).toBe(PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED);
  expect(changed.label).toBe('Source changed');
  // Only the version that moved is named — the current one is not blamed, and it
  // is named by the exact saved version name, with no slot suffix.
  expect(changed.changedVersionNames).toEqual(['Level 4 version']);
  expect(changed.reason).toBe('Level 4 version was regenerated after this proposal');

  const missingSource = resolveProposalSourceState({
    proposal: { id: 'c', selected_version_ids: ['v2'] },
    versionsById,
    savedReportsByVersionId: new Map(),
  });
  expect(missingSource.state).toBe(PROPOSAL_LIBRARY_SOURCE_STATE.MISSING_SOURCE);
  expect(missingSource.label).toBe('Missing source');
  expect(missingSource.reason).toContain('has no saved Visual and Technical Report');

  expect(PROPOSAL_LIBRARY_SOURCE_LABEL[PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED]).toBe('Source changed');
  // A legacy single-version proposal is read the same way.
  expect(proposalVersionIds({ version_id: 'v1' })).toEqual(['v1']);
  expect(proposalVersionIds({ selected_version_ids: ['v2', 'v1'] })).toEqual(['v2', 'v1']);
  expect(proposalVersionIds(null)).toEqual([]);
});

/* ── TEST 11 — regeneration is a linked revision ──────────────────────── */

test('TEST 11 — regeneration creates a linked revision and never overwrites the original', () => {
  // The wizard states the proposal it regenerates, names it, and passes the link.
  expect(WIZARD).toContain('const parentProposalId = regenerateFrom?.id || null;');
  expect(WIZARD).toContain('parent_proposal_id: parentProposalId,');
  expect(WIZARD).toContain('A new revision will be created and linked to it');
  expect(WIZARD).toContain('const [step, setStep] = useState(regenerateFrom ? 2 : 0);');
  expect(WIZARD).toContain('regenerateFrom.selected_version_ids');

  // The server links the NEW record by revision number…
  expect(SERVER).toContain('parent_proposal_id: parentProposal.id,');
  expect(SERVER).toContain('version: revisionNumber,');
  expect(SERVER).toContain('version_label: `Revision ${revisionNumber}`,');
  // …and never rewrites, demotes or hides the original.
  expect(SERVER).not.toMatch(/Proposal\.update\(parentProposalId/);
  expect(SERVER).not.toMatch(/Proposal\.delete\(\s*parentProposal/);
  // The only delete is the rollback of a proposal this call just created.
  expect((SERVER.match(/Proposal\.delete\(/g) || []).length).toBe(1);
  // Neither record is promoted or demoted by a regeneration.
  expect(SERVER).not.toMatch(/is_current_version/);
  // A regeneration of a regeneration keeps counting.
  expect(SERVER).toMatch(/revisionNumber = \(Number\.isFinite\(parentVersion\) && parentVersion > 0 \? parentVersion : 1\) \+ 1;/);

  // The library offers Regenerate and shows the revision beside the original.
  expect(CENTRE).toContain('onRegenerate={(proposal) => openWizard(proposal)}');
  expect(TAB).toContain('onRegenerate');
  expect(ACTIONS).toContain('onRegenerate?.(proposal)');

  const original = { id: 'a', project_id: 'p1', updated_date: '2026-10-01T10:00:00.000Z' };
  const revision = {
    id: 'b',
    project_id: 'p1',
    updated_date: '2026-10-02T10:00:00.000Z',
    parent_proposal_id: 'a',
    version: 2,
    version_label: 'Revision 2',
  };
  expect(revisionLabel(original)).toBe('Original');
  expect(revisionLabel(revision)).toBe('Revision 2');
  // Both remain listed and independently openable.
  const groups = groupProposalsByProject(
    [original, revision],
    new Map([['p1', { id: 'p1', name: 'Marquee Home' }]]),
  );
  expect(groups[0].proposals.map((proposal) => proposal.id)).toEqual(['b', 'a']);
  expect(read('src/components/proposal/library/RevisionBadge.jsx')).toContain('regenerated from latest source');
});

/* ── TEST 12 — comparison rows state the exact saved version names ─────── */

test('TEST 12 — a comparison’s readiness rows and cards state the exact saved version names', () => {
  // Two selected versions, named exactly as the designer saved them.
  const level4 = resolveVersionReadinessRow({
    versionId: 'v1',
    versionName: versionDisplayName({ version_name: 'Level 4 version', version_number: 4 }),
    versionNumber: 4,
    cells: {},
  });
  const original = resolveVersionReadinessRow({
    versionId: 'v2',
    versionName: versionDisplayName({ version_name: 'Original Design', version_number: 1 }),
    versionNumber: 1,
    cells: {},
  });

  const gate = resolveProposalReadinessGate({ rows: [level4, original], minVersions: 2, maxVersions: 3 });
  expect(gate.rows.map((row) => row.versionName)).toEqual(['Level 4 version', 'Original Design']);
  // Every row is named by its exact saved name, and no row carries a V-slot label.
  for (const row of gate.rows) {
    expect(row.versionName).not.toMatch(/·\s*V\d/);
    expect(row.blockingSentence).toContain(row.versionName);
  }
  expect(gate.message).toContain('Level 4 version is missing');
  expect(gate.message).toContain('Original Design is missing');

  // A proposal card shows EVERY version it was built from, by saved name.
  const card = read('src/components/proposal/ProposalCard.jsx');
  expect(card).toContain('versionNames.map');
  const library = read('src/components/proposal/library/useProposalLibrary.js');
  expect(library).toContain('savedName || `Version ${number}`');
  expect(library).not.toContain('· V${');
});