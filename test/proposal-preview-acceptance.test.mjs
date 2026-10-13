/**
 * Acceptance: the published proposal and its read-only preview.
 * ------------------------------------------------------------
 * The request's acceptance cases, as deterministic checks against the real
 * Genesis proposal's frozen approved copy (test/fixtures/genesisProposalFixture.mjs):
 *
 *   A  all ten validated prose paragraphs survive Editor and print preparation
 *   B  the Key Performance Highlights introduction appears once, above its table
 *   C  the centre-channel sentence remains visible
 *   D  longer sections keep every approved paragraph, none shortened
 *   E  the Formal Cinema Seating and Relaxed Sofas images appear with the
 *      validated Presented Options explanation
 *   F  that explanation is printed exactly once
 *   G  no raw dealer note enters publication
 *   H  cover first, and the document closes with the design: no Appendix
 *   I  Editor and print carry identical approved text
 *   J  Ready to Issue is blocked when required published content disappears
 *   K  Preview Document makes no database write
 *   L  preview and export compose the same document, from one code path
 *   M  saved proposals are never rewritten
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

import { prepareSectionBody, plainTextOf } from '../src/components/proposal/sectionBodyAuthority.js';
import { isClientVisibleSection } from '../src/components/proposal/print/editorialComposition.js';
import {
  preparePublishedSectionBody,
  missingPublishedContent,
} from '../base44/shared/proposalEdit/publishedSectionPreparation.js';
import {
  EXPORT_MODE,
  PREVIEW_MODE,
  readLayerAction,
  requiresIssueGate,
  shouldRecordIssuedExport,
} from '../src/components/proposal/export/proposalExportMode.js';
import {
  canonicalSectionTypes,
  orderPublicationSections,
} from '../src/components/proposal/publicationOrder.js';
import ProposalPackDocument from '../src/components/proposal/print/ProposalPackDocument.jsx';
import ProposalPrintDocument from '../src/components/proposal/export/ProposalPrintDocument.jsx';
import { validateCompleteDocument } from '../base44/shared/proposalEdit/completeDocumentValidation.js';
import { containsPrivateNote } from '../base44/shared/proposalEdit/privateNoteAuthority.js';
import { completeFixture, PRIVATE_NOTE } from './fixtures/completeDocumentFixtures.mjs';
import {
  GENESIS_ASSETS,
  GENESIS_CENTRE_SENTENCE,
  GENESIS_COMPARISON_NOTES,
  GENESIS_PARAGRAPHS,
  GENESIS_SECTIONS,
  genesisPackProps,
  genesisSections,
  validatedOptionsForGenesis,
} from './fixtures/genesisProposalFixture.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const EDITOR_SOURCE = read('../src/pages/ProposalEditor.jsx');
const HOOK_SOURCE = read('../src/components/proposal/export/useProposalExport.js');

/** Words only, so entity, punctuation and case differences are never a false failure. */
const words = (value) => plainTextOf(value)
  .replace(/[\u2018\u2019\u201c\u201d"']/g, ' ')
  .replace(/[\u2013\u2014-]/g, ' ')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const countOf = (haystack, needle) => String(haystack).split(needle).length - 1;
const paragraphsOf = (html) => String(html || '')
  .split(/<\/p>/i)
  .map((chunk) => chunk.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const sections = genesisSections();
const optionsCopy = validatedOptionsForGenesis(sections);
const renderGenesis = () => renderToStaticMarkup(React.createElement(ProposalPackDocument, genesisPackProps()));

// The Editor prepares a body with the section's own stored title and the
// design's channel density; the pack prepares it with proseOnly as well. Both
// are the SAME authority preparing the SAME stored body.
const editorPrepared = (section) => prepareSectionBody(section.body, {
  title: section.title,
  sectionType: section.section_type,
  highChannel: true,
});
const printPrepared = (section) => preparePublishedSectionBody(section.body, {
  title: section.title,
  sectionType: section.section_type,
  highChannel: true,
  proposalType: 'system_summary',
});

describe('A. the ten approved paragraphs survive both preparations', () => {
  it('keeps every paragraph of every section in the Editor and in print', () => {
    expect(GENESIS_PARAGRAPHS).toHaveLength(10);
    GENESIS_SECTIONS.filter((section) => section.body.trim()).forEach((section) => {
      const editor = words(editorPrepared(section));
      const printed = words(printPrepared(section));
      const paragraphs = paragraphsOf(section.body);
      expect(paragraphs.length).toBeGreaterThan(0);
      paragraphs.forEach((paragraph) => {
        expect(editor).toContain(words(paragraph));
        expect(printed).toContain(words(paragraph));
      });
    });
  });

  it('keeps every paragraph of every client-facing section in the printed document', () => {
    const html = words(renderGenesis());
    // The Appendix is not a client-facing section: its evidence is carried by the
    // Project Report, so it has no page in the pack. Every other stored paragraph
    // prints, character for character.
    GENESIS_SECTIONS
      .filter((section) => section.body.trim() && isClientVisibleSection(section.section_type))
      .forEach((section) => {
        paragraphsOf(section.body).forEach((paragraph) => {
          expect(html).toContain(words(paragraph));
        });
      });
  });
});

describe('B. the Key Performance Highlights introduction', () => {
  it('prints once, immediately above the table, and nowhere else', () => {
    const html = renderGenesis();
    const intro = GENESIS_SECTIONS.find((section) => section.section_type === 'key_performance_highlights');
    const firstSentence = paragraphsOf(intro.body)[0].split(/(?<=\.)\s+/)[0];

    expect(countOf(html, firstSentence)).toBe(1);
    // Counted in the document's own markup: the print stylesheet names the
    // introduction in its keep-with-the-table rule, and a class name in a rule is
    // not a second copy of the copy.
    expect(countOf(html.replace(/<style[\s\S]*?<\/style>/g, ''), 'pp-highlights__intro')).toBe(1);

    // Document order: the page's own headline, then the introduction, then the
    // table it introduces. Read from the document's own markup: the print
    // stylesheet names both classes in its break rules, and it is printed at the
    // top of the document, above the cover.
    const markup = html.replace(/<style[\s\S]*?<\/style>/g, '');
    const headingAt = markup.indexOf('Key Performance Highlights');
    const introAt = markup.indexOf('pp-highlights__intro');
    const tableAt = markup.indexOf('kph-table', introAt);
    expect(headingAt).toBeGreaterThan(-1);
    expect(introAt).toBeGreaterThan(headingAt);
    expect(tableAt).toBeGreaterThan(introAt);
  });
});

describe('C. the centre-channel sentence', () => {
  it('remains visible in the published document', () => {
    expect(countOf(renderGenesis(), GENESIS_CENTRE_SENTENCE)).toBe(1);
  });
});

describe('D. no silent shortening', () => {
  it('keeps a long section whole rather than cutting it to a page', () => {
    const long = `<h2>Overall Design</h2>${[1, 2, 3, 4, 5, 6, 7, 8]
      .map((n) => `<p>Paragraph ${n}. A second sentence that belongs to paragraph ${n}.</p>`)
      .join('')}`;
    const printed = preparePublishedSectionBody(long, {
      title: 'Overall Design',
      sectionType: 'overall_design',
      highChannel: false,
      proposalType: 'system_summary',
    });
    expect(paragraphsOf(printed)).toHaveLength(8);
    for (let n = 1; n <= 8; n += 1) {
      expect(printed).toContain(`A second sentence that belongs to paragraph ${n}.`);
    }
  });

  it('carries no paragraph or sentence limit in either authority', () => {
    [read('../src/components/proposal/sectionBodyAuthority.js'),
      read('../base44/shared/proposalEdit/publishedSectionPreparation.js')]
      .forEach((source) => {
        expect(source).not.toMatch(/limitProseParagraphs|PARAGRAPH_SENTENCE_LIMIT|PROSE_PARAGRAPH_LIMIT|PROSE_SENTENCE_LIMIT/);
      });
  });
});

describe('E / F. the seating alternatives and their explanation', () => {
  it('shows both options with the validated explanation on the Presented Options page', () => {
    const html = renderGenesis();
    const start = html.indexOf('pp-page--presented_options');
    expect(start).toBeGreaterThan(-1);
    const nextSection = html.indexOf('proposal-print-section', start + 10);
    const optionsPage = html.slice(start, nextSection > start ? nextSection : undefined);

    const formal = GENESIS_ASSETS.find((asset) => asset.comparison_option_label === 'Formal Cinema Seating');
    const sofas = GENESIS_ASSETS.find((asset) => asset.comparison_option_label === 'Relaxed Sofas');
    expect(optionsPage).toContain(formal.file_url);
    expect(optionsPage).toContain(sofas.file_url);
    expect(optionsPage).toContain('Formal Cinema Seating');
    expect(optionsPage).toContain('Relaxed Sofas');
    expect(words(optionsPage)).toContain(words(optionsCopy));
  });

  it('prints each option photograph exactly once', () => {
    const html = renderGenesis();
    expect(countOf(words(html), words(optionsCopy))).toBe(1);
    // Each option is stated once, as its caption, and each photograph prints
    // once: the label is also the image's alt text, so the caption is counted.
    ['Formal Cinema Seating', 'Relaxed Sofas'].forEach((label) => {
      expect(countOf(html, `pp-media__caption">${label}<`)).toBe(1);
    });
    const options = GENESIS_ASSETS.filter((asset) => asset.comparison_enabled);
    // Counted in the printed document itself. The machine-readable inventory of
    // the sources an export must preserve (`data-selected-images`) names every
    // selected image, and an inventory entry is not a second photograph — so the
    // count is taken with the inventory and the stylesheets set aside.
    const printed = html
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/data-selected-images="[^"]*"/g, '');
    expect(countOf(printed, '<figure class="pp-media pp-media--comparison"')).toBe(options.length);
    options.forEach((asset) => {
      expect(countOf(printed, asset.file_url)).toBe(1);
      expect(countOf(printed, `<img src="${asset.file_url}"`)).toBe(1);
    });
  });
});

describe('G. raw dealer notes never reach the client document', () => {
  it('keeps the designer\'s own comparisons notes out of the printed pack', () => {
    const html = renderGenesis();
    GENESIS_COMPARISON_NOTES.forEach((note) => {
      expect(html).not.toContain(note);
      expect(words(html)).not.toContain(words(note));
    });
  });

  it('still blocks a raw note through the publication gate', () => {
    const fixture = completeFixture();
    fixture.generationRecords[0].gpt_output.sections.find((row) => row.section === 'presented_options').text = PRIVATE_NOTE;
    fixture.sections.find((row) => row.section_type === 'presented_options').body = `<p>${PRIVATE_NOTE}</p>`;
    const result = validateCompleteDocument({
      proposal: fixture.proposal,
      sections: fixture.sections,
      generationRecords: fixture.generationRecords,
      editRecords: fixture.editRecords,
      optionGuidance: fixture.optionGuidance,
      privateNotes: [PRIVATE_NOTE],
      publishedAssetText: [],
    });
    const published = result.document_sections.map((section) => String(section.body || '')).join(' ');
    expect(containsPrivateNote(published, [PRIVATE_NOTE])).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('raw_dealer_notes');
  });
});

describe('H. document order', () => {
  it('opens with the cover and closes with the design, never an Appendix', () => {
    expect(canonicalSectionTypes('system_summary')[0]).toBe('cover');
    // The stored report still carries its Appendix section: the pack simply has
    // no page for it, because the Project Report already prints that evidence.
    expect(canonicalSectionTypes('system_summary').at(-1)).toBe('appendix');

    const html = renderGenesis();
    const cover = html.indexOf('proposal-print-cover');
    expect(cover).toBeGreaterThan(-1);
    // Not the section, not its heading, and not its copy — and nothing closes the
    // document in its place.
    expect(html).not.toContain('pp-page--appendix');
    expect(html).not.toContain('class="pp-endnote"');
    const appendix = GENESIS_SECTIONS.find((section) => section.section_type === 'appendix');
    expect(html).not.toContain(`>${appendix.title}<`);
    paragraphsOf(appendix.body).forEach((paragraph) => {
      expect(words(html)).not.toContain(words(paragraph));
    });
    // No section page is printed above the cover.
    expect(html.indexOf('pp-page--system_design_summary')).toBeGreaterThan(cover);
    // The alternatives belong to the copy that explains them, and that page is
    // part of the document's own order.
    expect(html.indexOf('pp-page--presented_options')).toBeGreaterThan(cover);
  });

  it('orders stored rows canonically however the database returned them', () => {
    const shuffled = [...sections].reverse();
    const ordered = orderPublicationSections({ sections: shuffled, proposalType: 'system_summary' })
      .map((section) => section.section_type);
    expect(ordered).toEqual(canonicalSectionTypes('system_summary')
      .filter((type) => ordered.includes(type)));
  });
});

describe('I. Editor and print carry identical approved text', () => {
  it('prepares one text for both, section for section', () => {
    GENESIS_SECTIONS.filter((section) => section.body.trim()).forEach((section) => {
      expect(words(editorPrepared(section))).toBe(words(printPrepared(section)));
    });
  });

  it('shows the same approved text on the printed page', () => {
    const html = words(renderGenesis());
    const summary = GENESIS_SECTIONS.find((section) => section.section_type === 'system_design_summary');
    expect(html).toContain(words(printPrepared(summary)));
  });
});

describe('J. Ready to Issue is blocked when published content disappears', () => {
  it('reports the copy a published page has lost', () => {
    const truncated = GENESIS_SECTIONS.find((section) => section.section_type === 'system_design_summary').body
      .replace(GENESIS_CENTRE_SENTENCE, '');
    const missing = missingPublishedContent({
      approvedHtml: GENESIS_SECTIONS.find((section) => section.section_type === 'system_design_summary').body,
      publishedHtml: truncated,
      title: 'System Design Summary',
      sectionType: 'system_design_summary',
    });
    expect(missing).toMatch(/centre channel/);
  });

  it('blocks the complete document gate', () => {
    const fixture = completeFixture();
    const summary = fixture.sections.find((row) => row.section_type === 'system_design_summary');
    summary.body = '<p>Design Summary</p>';
    const result = validateCompleteDocument({
      proposal: fixture.proposal,
      sections: fixture.sections,
      generationRecords: fixture.generationRecords,
      editRecords: fixture.editRecords,
      optionGuidance: fixture.optionGuidance,
      privateNotes: [],
      publishedAssetText: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('published_content_missing');
  });
});

describe('K. the read-only preview makes no database write', () => {
  it('never asks for the issue gate and never stores an issued copy', () => {
    expect(readLayerAction(PREVIEW_MODE)).toBe(PREVIEW_MODE);
    expect(readLayerAction(EXPORT_MODE)).toBe(EXPORT_MODE);
    expect(requiresIssueGate(PREVIEW_MODE)).toBe(false);
    expect(requiresIssueGate(EXPORT_MODE)).toBe(true);
    expect(shouldRecordIssuedExport({ mode: PREVIEW_MODE, issuedDocument: { documentType: 'proposal' } })).toBe(false);
    expect(shouldRecordIssuedExport({ mode: EXPORT_MODE, issuedDocument: { documentType: 'proposal' } })).toBe(true);
    expect(shouldRecordIssuedExport({ mode: PREVIEW_MODE })).toBe(false);
  });

  it('reaches the only issued-copy write through that decision', () => {
    const guarded = HOOK_SOURCE.indexOf('shouldRecordIssuedExport({ mode, issuedDocument })) {');
    const write = HOOK_SOURCE.indexOf('recordIssuedExportInBackground({');
    expect(guarded).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guarded);
  });

  it('writes no record, no status and no section from the export hook', () => {
    ['base44.entities.', 'transitionProposalStatus', 'persistProposalSectionEdit', 'appendProposalEdit']
      .forEach((write) => expect(HOOK_SOURCE).not.toContain(write));
    // The one server call the hook makes is the read-only edit layer, in both modes.
    expect(countOf(HOOK_SOURCE, 'base44.functions.invoke(')).toBe(1);
    expect(HOOK_SOURCE).toContain("base44.functions.invoke('readProposalEditLayer'");
  });

  it('reads the document through the read-only layer, never a write path', () => {
    // One read path for the whole document: the export path reads the record
    // layer through the read-only server action, and the action it asks for is
    // the one the mode dictates.
    expect(HOOK_SOURCE).toContain("base44.functions.invoke('readProposalEditLayer'");
    expect(HOOK_SOURCE).toContain('readLayerAction(mode)');
    // The editor consumes that one path rather than opening its own.
    expect(EDITOR_SOURCE).toContain('useProposalExport');
    // The same read-only layer the rest of the app reads a proposal through.
    expect(read('../src/components/proposal/generation/useProposalEditLayer.js'))
      .toContain("base44.functions.invoke('readProposalEditLayer'");
  });
});

describe('L. preview and export compose the same document', () => {
  it('mounts the real pack once, for both modes', () => {
    // One composition for both actions: the print document portals the real
    // pack, and the editor mounts that single composition once. There is no
    // second preview renderer to drift from it.
    const printDocument = read('../src/components/proposal/export/ProposalPrintDocument.jsx');
    expect(printDocument)
      .toContain("import ProposalPackDocument from '@/components/proposal/print/ProposalPackDocument'");
    expect(printDocument).toContain('<ProposalPackDocument {...props} />');
    expect(countOf(EDITOR_SOURCE, '<ProposalPrintDocument')).toBe(1);
    expect(countOf(EDITOR_SOURCE, '<ProposalPrintStyles />')).toBe(1);
    expect(typeof ProposalPrintDocument).toBe('function');
  });

  it('runs one preparation path, with the mode deciding only whether it issues', () => {
    expect(HOOK_SOURCE).toContain('handleExport = useCallback(() => runPrint(EXPORT_MODE)');
    expect(HOOK_SOURCE).toContain('handlePreview = useCallback(() => runPrint(PREVIEW_MODE)');
    expect(countOf(HOOK_SOURCE, 'const runPrint = useCallback(')).toBe(1);
  });

  it('composes an identical document every time', () => {
    const first = renderGenesis();
    const second = renderGenesis();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(2000);
  });
});

describe('M. saved proposals are never rewritten', () => {
  it('leaves the stored section records untouched through composition', () => {
    const stored = genesisSections();
    const before = JSON.stringify(stored);
    renderToStaticMarkup(React.createElement(ProposalPackDocument, { ...genesisPackProps(), sections: stored }));
    orderPublicationSections({ sections: stored, proposalType: 'system_summary' });
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('leaves generation and edit records untouched through validation', () => {
    const fixture = completeFixture();
    const before = JSON.stringify({
      sections: fixture.sections,
      generationRecords: fixture.generationRecords,
      editRecords: fixture.editRecords,
    });
    validateCompleteDocument({
      proposal: fixture.proposal,
      sections: fixture.sections,
      generationRecords: fixture.generationRecords,
      editRecords: fixture.editRecords,
      optionGuidance: fixture.optionGuidance,
      privateNotes: [],
      publishedAssetText: [],
    });
    expect(JSON.stringify({
      sections: fixture.sections,
      generationRecords: fixture.generationRecords,
      editRecords: fixture.editRecords,
    })).toBe(before);
  });
});