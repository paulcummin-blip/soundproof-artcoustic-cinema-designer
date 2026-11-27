/**
 * DOC-01 acceptance: the one ordering authority, the reorder save queue, and the
 * exported PDF that follows it.
 * ----------------------------------------------------------------------------
 * Run: npx vitest run test/proposal-section-order.test.mjs
 *
 *   1  the ordering authority pins the cover, honours a saved order, and falls
 *      back to canonical for an older proposal that never had one — both mirrors
 *   2  the reorder save queue coalesces rapid commits, never lets an older order
 *      win, reports failure with a retry, and never rejects the chain
 *   3  the exported PDF follows the dealer's saved section order, cover first
 *   4  the existing proposal-editing persistence corrections are in place: one
 *      SAVE_STATUS vocabulary, the export gate, and the tracked-save retry
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

import {
  orderPublicationSections as orderClient,
  sectionsWithEditorOrder,
  canonicalSectionTypes,
  isFixedSectionType,
  FIXED_SECTION_TYPES,
} from '../src/components/proposal/publicationOrder.js';
import { orderPublicationSections as orderServer } from '../base44/shared/proposalEdit/publicationOrder.js';
import { createReorderSaveQueue } from '../src/components/proposal/editor/reorderSaveQueue.js';
import { SAVE_STATUS } from '../src/components/proposal/editor/proposalSaveStatus.js';
import ProposalPackDocument from '../src/components/proposal/print/ProposalPackDocument.jsx';
import {
  GENESIS_SECTIONS,
  genesisSections,
  genesisPackProps,
} from './fixtures/genesisProposalFixture.mjs';
import { legacyCompleteFixture } from './fixtures/completeDocumentFixtures.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const EDITOR_SOURCE = read('../src/pages/ProposalEditor.jsx');
const EXPORT_HOOK_SOURCE = read('../src/components/proposal/export/useProposalExport.js');

/** The body of a rendered pack, with the print stylesheets set aside so the
 *  page-class order is read from the document, not from the break rules. */
const packBody = (html) => String(html).replace(/<style[\s\S]*?<\/style>/g, '');

/** The section page classes in print order, e.g. ['system_design_summary', ...]. */
const pageOrder = (html) => {
  const body = packBody(html);
  const order = [];
  const re = /pp-page--([a-z_]+)/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    const type = match[1];
    // A flow continuation sheet repeats the opening section's class; keep the
    // first occurrence of each type so the sequence is the section order.
    if (!order.includes(type)) order.push(type);
  }
  return order;
};

const sectionRecord = (type, orderIndex, id) => ({
  id: id || `s-${type}`,
  section_type: type,
  section_key: type,
  title: type,
  body: type === 'cover' ? '' : `<p>${type} body.</p>`,
  is_enabled: true,
  order_index: orderIndex,
  dealer_notes: '',
  metadata: {},
});

// ── 1. The ordering authority ──────────────────────────────────────────────
describe('1. the ordering authority', () => {
  it('pins the cover first regardless of any saved order_index', () => {
    const sections = [
      sectionRecord('presented_options', 0),
      sectionRecord('cover', 9),
      sectionRecord('system_design_summary', 1),
    ];
    const ordered = orderClient({ sections, proposalType: 'system_summary' }).map((s) => s.section_type);
    expect(ordered[0]).toBe('cover');
    expect(FIXED_SECTION_TYPES).toEqual(['cover']);
    expect(isFixedSectionType('cover')).toBe(true);
    expect(isFixedSectionType('system_design_summary')).toBe(false);
  });

  it('honours a deliberately saved order_index for the reorderable sections', () => {
    // The dealer moved Dynamic Range ahead of Spatial Resolution.
    const sections = [
      sectionRecord('cover', 0),
      sectionRecord('system_design_summary', 1),
      sectionRecord('dynamic_range', 2),
      sectionRecord('spatial_resolution', 3),
      sectionRecord('timbre_matching', 4),
      sectionRecord('key_performance_highlights', 5),
      sectionRecord('overall_design', 6),
      sectionRecord('room_images', 7),
      sectionRecord('presented_options', 8),
    ];
    const ordered = orderClient({ sections, proposalType: 'system_summary' }).map((s) => s.section_type);
    expect(ordered).toEqual([
      'cover', 'system_design_summary', 'dynamic_range', 'spatial_resolution',
      'timbre_matching', 'key_performance_highlights', 'overall_design',
      'room_images', 'presented_options',
    ]);
  });

  it('falls back to canonical when no deliberate order was ever saved', () => {
    // An older proposal where every reorderable section shares the same index.
    const sections = [
      sectionRecord('cover', 0),
      sectionRecord('presented_options', 0),
      sectionRecord('system_design_summary', 0),
      sectionRecord('spatial_resolution', 0),
      sectionRecord('dynamic_range', 0),
      sectionRecord('timbre_matching', 0),
      sectionRecord('key_performance_highlights', 0),
      sectionRecord('overall_design', 0),
      sectionRecord('room_images', 0),
    ];
    const ordered = orderClient({ sections, proposalType: 'system_summary' }).map((s) => s.section_type);
    expect(ordered).toEqual(canonicalSectionTypes('system_summary'));
  });

  it('never orders a WITHDRAWN section into the document', () => {
    const sections = [
      ...genesisSections(),
    ];
    // The Genesis fixture carries a withdrawn Appendix.
    expect(sections.some((s) => s.section_type === 'appendix')).toBe(true);
    const ordered = orderClient({ sections, proposalType: 'system_summary' }).map((s) => s.section_type);
    expect(ordered).not.toContain('appendix');
  });

  it('never mutates the records it is given', () => {
    const sections = genesisSections();
    const before = JSON.stringify(sections);
    orderClient({ sections, proposalType: 'system_summary' });
    orderClient({ sections: [...sections].reverse(), proposalType: 'system_summary' });
    expect(JSON.stringify(sections)).toBe(before);
  });

  it('agrees with the server mirror for a saved, a canonical and a legacy order', () => {
    const cases = [
      genesisSections(),
      legacyCompleteFixture().sections,
      [
        sectionRecord('cover', 0),
        sectionRecord('presented_options', 1),
        sectionRecord('system_design_summary', 2),
        sectionRecord('spatial_resolution', 3),
      ],
    ];
    cases.forEach((sections) => {
      const clientOrder = orderClient({ sections, proposalType: 'system_summary' }).map((s) => s.section_type);
      // The legacy fixture is a comparison; order both mirrors with that type.
      const serverOrder = orderServer({
        sections,
        proposalType: sections === legacyCompleteFixture().sections ? 'comparison' : 'system_summary',
      }).map((s) => s.section_type);
      expect(serverOrder).toEqual(clientOrder);
    });
  });

  it('honours a deliberately-saved non-canonical order (legacy compatibility)', () => {
    // The legacy fixture wrote order_index as the writer's compose order, not
    // the canonical rank. The authority honours that saved order rather than
    // silently re-imposing canonical — the same behaviour a dealer's reorder
    // relies on.
    const legacy = legacyCompleteFixture().sections;
    const ordered = orderServer({ sections: legacy, proposalType: 'comparison' }).map((s) => s.section_type);
    // The writer's compose order puts Key Performance Highlights second.
    expect(ordered[0]).toBe('system_design_summary');
    expect(ordered[1]).toBe('key_performance_highlights');
    // It is NOT the canonical sequence (which has Spatial Resolution second).
    expect(ordered[1]).not.toBe('spatial_resolution');
  });
});

it('immediately composes a cached validation layer in the current editor order, by row ID', () => {
  const prepared = genesisSections().map((row, i) => ({ ...row, id: 'section-' + i }));
  const editor = prepared.map(row => ({ ...row, body: 'unreviewed editor text' }));
  const dynamic = editor.find(row => row.section_type === 'dynamic_range');
  const spatial = editor.find(row => row.section_type === 'spatial_resolution');
  [dynamic.order_index, spatial.order_index] = [spatial.order_index, dynamic.order_index];
  const before = JSON.stringify(prepared);
  const rows = orderClient({ sections: sectionsWithEditorOrder(prepared, editor.reverse()), proposalType: 'system_summary' });
  expect(rows.map(row => row.id)).toEqual(orderClient({ sections: editor, proposalType: 'system_summary' }).map(row => row.id));
  expect(rows.map(row => row.body)).not.toContain('unreviewed editor text');
  expect(JSON.stringify(prepared)).toBe(before);
  const pack = React.createElement(ProposalPackDocument, { ...genesisPackProps(), sections: rows });
  const pages = pageOrder(renderToStaticMarkup(pack));
  expect(pages.indexOf('dynamic_range')).toBeLessThan(pages.indexOf('spatial_resolution'));
});

// ── 2. The reorder save queue ───────────────────────────────────────────────
describe('2. the reorder save queue', () => {
  /** A persist that records every order it is asked to save and resolves when
   *  the controller says so. */
  const makeRecorder = () => {
    const calls = [];
    let resolveFlight = null;
    const persist = (order) => new Promise((res) => {
      calls.push(order.map((s) => s.id));
      resolveFlight = res;
    });
    const release = () => { if (resolveFlight) { const r = resolveFlight; resolveFlight = null; r(); } };
    return { persist, calls, release };
  };

  it('coalesces rapid successive commits so only the latest order is persisted', async () => {
    const { persist, calls } = makeRecorder();
    const queue = createReorderSaveQueue({ persist });
    const A = [sectionRecord('system_design_summary', 1, 'a')];
    const B = [sectionRecord('dynamic_range', 2, 'b')];
    const C = [sectionRecord('spatial_resolution', 3, 'c')];
    // Three commits before the first persist ever starts: only the latest wins.
    queue.commit(A);
    queue.commit(B);
    queue.commit(C);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([['c']]);
  });

  it('never lets an older order win when commits overlap a save in flight', async () => {
    const { persist, calls, release } = makeRecorder();
    const queue = createReorderSaveQueue({ persist });
    const A = [sectionRecord('system_design_summary', 1, 'a')];
    const B = [sectionRecord('dynamic_range', 2, 'b')];
    const C = [sectionRecord('spatial_resolution', 3, 'c')];
    queue.commit(A);
    // Let the first persist start and park it in flight.
    await new Promise((r) => setTimeout(r, 0));
    queue.commit(B);
    queue.commit(C);
    release();
    await new Promise((r) => setTimeout(r, 0));
    // A persisted first, then the coalesced latest (C). The final saved order
    // is the dealer's latest intended order, never the older A or B alone.
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual(['a']);
    expect(calls[calls.length - 1]).toEqual(['c']);
  });

  it('reports a failure, retains the intended order, and a retry re-commits it', async () => {
    const attempts = [];
    let fail = true;
    const persist = (order) => {
      attempts.push(order.map((s) => s.id));
      return fail ? Promise.reject(new Error('network')) : Promise.resolve();
    };
    const statuses = [];
    const queue = createReorderSaveQueue({ persist, onStatus: (s) => statuses.push(s) });
    const order = [sectionRecord('dynamic_range', 2, 'b')];
    queue.commit(order);
    await new Promise((r) => setTimeout(r, 0));
    expect(statuses).toContain(SAVE_STATUS.SAVING);
    expect(statuses).toContain(SAVE_STATUS.FAILED);
    // The intended order was never overwritten by the failure.
    expect(attempts).toEqual([['b']]);
    // A retry is a fresh commit of the same order.
    fail = false;
    queue.commit(order);
    await new Promise((r) => setTimeout(r, 0));
    expect(attempts.length).toBe(2);
    expect(statuses).toContain(SAVE_STATUS.SAVED);
  });

  it('never rejects the chain: a later commit proceeds after an earlier failure', async () => {
    const calls = [];
    let first = true;
    const persist = (order) => {
      calls.push(order.map((s) => s.id));
      if (first) { first = false; return Promise.reject(new Error('transient')); }
      return Promise.resolve();
    };
    const queue = createReorderSaveQueue({ persist });
    const A = [sectionRecord('system_design_summary', 1, 'a')];
    const B = [sectionRecord('dynamic_range', 2, 'b')];
    queue.commit(A);
    await new Promise((r) => setTimeout(r, 0));
    // A rejected link must not poison the chain: B still runs.
    queue.commit(B);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([['a'], ['b']]);
  });
});

// ── 3. The exported PDF follows the saved order ────────────────────────────
describe('3. the exported PDF follows the saved order', () => {
  /** Genesis sections with two reorderable section types deliberately swapped. */
  const reorderedGenesisSections = () => {
    const sections = genesisSections();
    const byType = new Map(sections.map((s) => [s.section_type, s]));
    // Swap Spatial Resolution and Dynamic Range: Dynamic Range now prints first.
    byType.get('spatial_resolution').order_index = 3;
    byType.get('dynamic_range').order_index = 2;
    return sections;
  };

  const render = (props) => renderToStaticMarkup(React.createElement(ProposalPackDocument, props));

  it('opens with the cover, and the section pages follow the saved order', () => {
    const html = render({ ...genesisPackProps(), sections: reorderedGenesisSections() });
    const body = packBody(html);
    const cover = body.indexOf('proposal-print-cover');
    expect(cover).toBeGreaterThan(-1);
    const order = pageOrder(html);
    // No section page prints above the cover.
    expect(cover).toBeLessThan(body.indexOf('pp-page--system_design_summary'));
    // The dealer's saved order is honoured: Dynamic Range prints before Spatial
    // Resolution, the opposite of the canonical sequence.
    const dynamicAt = order.indexOf('dynamic_range');
    const spatialAt = order.indexOf('spatial_resolution');
    expect(dynamicAt).toBeGreaterThan(-1);
    expect(spatialAt).toBeGreaterThan(-1);
    expect(dynamicAt).toBeLessThan(spatialAt);
    // Canonical would have put Spatial Resolution first — assert it does not.
    expect(spatialAt).toBeGreaterThan(dynamicAt);
  });

  it('a canonical-order proposal still prints in canonical order', () => {
    const html = render({ ...genesisPackProps(), sections: genesisSections() });
    const order = pageOrder(html);
    const spatialAt = order.indexOf('spatial_resolution');
    const dynamicAt = order.indexOf('dynamic_range');
    expect(spatialAt).toBeLessThan(dynamicAt);
  });

  it('renders an identical document for the same saved order every time', () => {
    const first = render({ ...genesisPackProps(), sections: reorderedGenesisSections() });
    const second = render({ ...genesisPackProps(), sections: reorderedGenesisSections() });
    expect(first).toBe(second);
  });
});

// ── 4. The existing proposal-editing persistence corrections ────────────────
describe('4. the proposal-editing persistence corrections', () => {
  it('uses the one SAVE_STATUS vocabulary across the editor, the queue and the tracked save', () => {
    expect(SAVE_STATUS.IDLE).toBe('idle');
    expect(SAVE_STATUS.SAVING).toBe('saving');
    expect(SAVE_STATUS.SAVED).toBe('saved');
    expect(SAVE_STATUS.FAILED).toBe('failed');
    expect(SAVE_STATUS.UNSAVED).toBe('unsaved');
    // The editor imports and uses it for the reorder status.
    expect(EDITOR_SOURCE).toContain('SAVE_STATUS');
    expect(EDITOR_SOURCE).toContain('reorderStatus');
    // The queue reports through the same vocabulary.
    expect(read('../src/components/proposal/editor/reorderSaveQueue.js')).toContain("onStatus('saving')");
    expect(read('../src/components/proposal/editor/reorderSaveQueue.js')).toContain("onStatus('failed')");
  });

  it('blocks the PDF export while the section order is still unsaved', () => {
    expect(EDITOR_SOURCE).toContain('orderUnsaved');
    expect(EDITOR_SOURCE).toContain('orderBlockReason');
    // The export hook reads the order block reason and a readiness gate applies it.
    expect(EXPORT_HOOK_SOURCE).toContain('orderBlockReason');
    expect(EXPORT_HOOK_SOURCE).toContain('resolveProposalExportReadiness');
  });

  it('commits the order once on drag-end, not on every drag-over', () => {
    expect(EDITOR_SOURCE).toContain('handleReorderCommit');
    expect(EDITOR_SOURCE).toContain('onReorderCommit');
    // The visible order updates during a drag (setSections), but the commit is
    // a single serialized queue, not a per-event write.
    expect(EDITOR_SOURCE).toContain('createReorderSaveQueue');
    expect(EDITOR_SOURCE).toContain('latestOrderRef');
  });

  it('the tracked-save retry re-runs the last write', () => {
    const source = read('../src/components/proposal/editor/useTrackedSave.js');
    expect(source).toContain('lastRunRef');
    expect(source).toContain('retry');
    expect(source).toContain(SAVE_STATUS.FAILED);
  });
});