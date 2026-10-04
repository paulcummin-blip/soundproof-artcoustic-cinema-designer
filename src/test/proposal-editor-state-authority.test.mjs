/**
 * Proposal Editor state contract.
 *
 * The rule under test: the editor must never go blank. Whatever the record and
 * its sections look like, the editor resolves to a named state with a title and
 * a way out — and it only shows the document when there is written content to
 * show.
 *
 * The failing cases are the ones that produced a blank page in production: a
 * proposal whose sections exist but whose structure sections carry no calculated
 * rows, and a proposal whose generation never wrote its sections at all.
 */
import { test, expect } from 'vitest';
import {
  PROPOSAL_EDITOR_STATE,
  GENERATION_POLL_LIMIT,
  resolveProposalEditorState,
  resolveProposalContextNotice,
  countWrittenSections,
  sectionHasWrittenBody,
} from '@/components/proposal/editor/proposalEditorStateAuthority';

const proposal = (over = {}) => ({
  id: 'proposal-1',
  project_id: 'project-1',
  title: 'Marquee Home Cinema',
  proposal_type: 'comparison',
  status: 'generated',
  selected_version_ids: ['v1', 'v4'],
  ...over,
});

const section = (type, body = '<p>Written copy</p>', over = {}) => ({
  id: `section-${type}`,
  proposal_id: 'proposal-1',
  section_type: type,
  section_key: type,
  title: type,
  body,
  is_enabled: true,
  order_index: 0,
  ...over,
});

/** The real record: eight sections, six of them written, no highlight rows. */
const REAL_SHAPE_SECTIONS = [
  section('cover', ''),
  section('system_design_summary'),
  section('spatial_resolution', '<p>Spatial</p>', { metadata: null }),
  section('dynamic_range', '<p>Dynamics</p>', { metadata: null }),
  section('timbre_matching', '<p>Timbre</p>', { metadata: null }),
  section('key_performance_highlights', '<h2>System Design Comparison</h2><p>Overview.</p>', { metadata: null }),
  section('overall_design'),
  section('room_images', ''),
];

test('every state names its condition and offers a way out', () => {
  const cases = [
    resolveProposalEditorState({ loading: true }),
    resolveProposalEditorState({ loading: false, proposal: null }),
    resolveProposalEditorState({ loading: false, loadError: 'load_failed', loadErrorDetail: 'Network error' }),
    resolveProposalEditorState({
      proposal: proposal({ status: 'generating' }),
      sections: [section('cover', '')],
    }),
    resolveProposalEditorState({ proposal: proposal({ status: 'draft' }), sections: [] }),
    resolveProposalEditorState({ proposal: proposal(), sections: [] }),
    resolveProposalEditorState({
      proposal: proposal(),
      sections: [section('not_a_report_section')],
    }),
    resolveProposalEditorState({ proposal: proposal(), sections: REAL_SHAPE_SECTIONS }),
  ];

  for (const view of cases) {
    expect(view.state, 'a state is always named').toBeTruthy();
    expect(view.title.length).toBeGreaterThan(0);
    expect(view.message.length).toBeGreaterThan(0);
    // Never a dead end: there is always a way back to the Proposal Centre.
    expect(view.actions.return, `${view.state} must offer a way back`).toBe(true);
  }
});

test('a readable proposal with written sections is the only state that shows the document', () => {
  const view = resolveProposalEditorState({
    proposal: proposal(),
    sections: REAL_SHAPE_SECTIONS,
    readableSections: REAL_SHAPE_SECTIONS.filter((s) => s.section_type !== 'not_a_report_section'),
  });
  expect(view.state).toBe(PROPOSAL_EDITOR_STATE.READY);
  expect(view.showSpinner).toBe(false);
  expect(view.actions.regenerate).toBe(false);
});

test('the production record renders: eight sections, six written, no rows', () => {
  expect(countWrittenSections(REAL_SHAPE_SECTIONS)).toBe(6);
  // Cover and Project Images carry no prose and never count as content.
  expect(sectionHasWrittenBody(section('cover', ''))).toBe(false);
  expect(sectionHasWrittenBody(section('room_images', ''))).toBe(false);

  const view = resolveProposalEditorState({
    proposal: proposal(),
    sections: REAL_SHAPE_SECTIONS,
    readableSections: REAL_SHAPE_SECTIONS,
  });
  expect(view.state).toBe(PROPOSAL_EDITOR_STATE.READY);
});

test('a generating proposal waits for its sections instead of opening empty', () => {
  const waiting = resolveProposalEditorState({
    proposal: proposal({ status: 'generating' }),
    sections: [section('cover', '')],
  });
  expect(waiting.state).toBe(PROPOSAL_EDITOR_STATE.GENERATING);
  expect(waiting.showSpinner).toBe(true);

  // Once the sections land, the same record opens the document.
  const settled = resolveProposalEditorState({
    proposal: proposal({ status: 'generating' }),
    sections: REAL_SHAPE_SECTIONS,
    readableSections: REAL_SHAPE_SECTIONS,
  });
  expect(settled.state).toBe(PROPOSAL_EDITOR_STATE.READY);

  // A wait that never settles becomes a stated failure, never an endless spinner.
  const timedOut = resolveProposalEditorState({
    proposal: proposal({ status: 'generating' }),
    sections: [section('cover', '')],
    timedOut: true,
  });
  expect(timedOut.state).toBe(PROPOSAL_EDITOR_STATE.GENERATION_FAILED);
  expect(timedOut.reason).toContain('did not finish');
});

test('a failed generation states the failure and offers regeneration', () => {
  const view = resolveProposalEditorState({ proposal: proposal({ status: 'draft' }), sections: [] });
  expect(view.state).toBe(PROPOSAL_EDITOR_STATE.GENERATION_FAILED);
  expect(view.actions.regenerate).toBe(true);
  expect(view.actions.return).toBe(true);
});

test('a proposal with no sections, unreadable sections, or empty sections is stated', () => {
  const noSections = resolveProposalEditorState({ proposal: proposal(), sections: [] });
  expect(noSections.state).toBe(PROPOSAL_EDITOR_STATE.NO_SECTIONS);
  expect(noSections.actions.regenerate).toBe(true);

  const unreadable = resolveProposalEditorState({
    proposal: proposal(),
    sections: [section('not_a_report_section')],
    readableSections: [],
  });
  expect(unreadable.state).toBe(PROPOSAL_EDITOR_STATE.UNREADABLE_SECTIONS);
  expect(unreadable.actions.regenerate).toBe(true);

  const empty = resolveProposalEditorState({
    proposal: proposal(),
    sections: [section('cover', ''), section('room_images', ''), section('overall_design', '   ')],
  });
  expect(empty.state).toBe(PROPOSAL_EDITOR_STATE.GENERATION_FAILED);
  expect(empty.reason).toContain('empty');
});

test('a missing or unreadable proposal is named, not left blank', () => {
  expect(resolveProposalEditorState({ loadError: 'not_found' }).state).toBe(PROPOSAL_EDITOR_STATE.NOT_FOUND);

  const failed = resolveProposalEditorState({ loadError: 'load_failed', loadErrorDetail: 'Network error' });
  expect(failed.state).toBe(PROPOSAL_EDITOR_STATE.LOAD_FAILED);
  expect(failed.reason).toBe('Network error');
  expect(failed.actions.retry).toBe(true);

  // No record and no error is still a named state, never an empty page.
  expect(resolveProposalEditorState({ loading: false }).state).toBe(PROPOSAL_EDITOR_STATE.NOT_FOUND);
});

test('the poll limit is a bounded wait', () => {
  expect(GENERATION_POLL_LIMIT).toBeGreaterThan(0);
  expect(GENERATION_POLL_LIMIT).toBeLessThanOrEqual(30);
});

test('a context that cannot be read is stated above the document, never instead of it', () => {
  expect(resolveProposalContextNotice({ projectReadFailed: true })).toContain('project could not be read');
  expect(resolveProposalContextNotice({ versionReadFailed: true })).toContain('design version');
  expect(resolveProposalContextNotice({})).toBe(null);
});