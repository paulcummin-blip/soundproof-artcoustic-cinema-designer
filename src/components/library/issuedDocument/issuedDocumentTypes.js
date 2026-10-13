/**
 * issuedDocumentTypes.js
 * ----------------------
 * The vocabulary and composition map for issued documents — the PDFs the
 * designer exports and Project Library keeps as fixed project assets.
 *
 * One authority for:
 *   - the document types a project library holds
 *   - the label each type is listed under
 *   - the print composition each type is captured from, so the stored PDF is
 *     produced from the same mounted composition the export prints (the same
 *     node, the same stylesheets, the same export body class)
 *
 * Pure: no DOM access, no network, no React.
 */

export const ISSUED_DOCUMENT_TYPE = Object.freeze({
  /** The consolidated Project Report — the client-facing engineering document. */
  PROJECT: 'project',
  /** Legacy Visual Report identity. Never written; listed for history only. */
  VISUAL: 'visual',
  TECHNICAL: 'technical',
  SYSTEM_DESIGN_SUMMARY: 'system_design_summary',
  PROPOSAL: 'proposal',
  COMPARISON: 'comparison',
  /**
   * The Current Speaker Design schedule — the equipment schedule of one design
   * version, exported with (and beside) the Project Report. Supporting project
   * documentation: it is never a report, never a proposal source and never
   * changes a report's status.
   */
  SPEAKER_DESIGN: 'speaker_design',
});

export const ISSUED_DOCUMENT_LABEL = Object.freeze({
  [ISSUED_DOCUMENT_TYPE.PROJECT]: 'Project Report',
  [ISSUED_DOCUMENT_TYPE.VISUAL]: 'Visual Report',
  [ISSUED_DOCUMENT_TYPE.TECHNICAL]: 'Technical Report',
  [ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY]: 'System Design Summary',
  [ISSUED_DOCUMENT_TYPE.PROPOSAL]: 'Proposal',
  [ISSUED_DOCUMENT_TYPE.COMPARISON]: 'System Design Comparison',
  [ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN]: 'Speaker Design',
});

/**
 * The content-driven page composer a composition may declare.
 *
 * A composition whose pages are its own content — rather than a fixed page frame
 * — names a composer here. That one composer runs over the same markup for the
 * printed PDF and for the stored Project Library copy, so the two documents are
 * paged identically. The token is a plain string, so it travels in a stored
 * snapshot without ever writing a function to a record.
 */
export const ISSUED_DOCUMENT_PAGE_COMPOSER = Object.freeze({
  /** The Current Speaker Design schedule: as many A4 content frames as it needs. */
  SPEAKER_DESIGN: 'speaker_design',
});

/** The document types that belong to the Library's Generated Reports section. */
export const REPORT_DOCUMENT_TYPES = Object.freeze([
  ISSUED_DOCUMENT_TYPE.PROJECT,
  ISSUED_DOCUMENT_TYPE.VISUAL,
  ISSUED_DOCUMENT_TYPE.TECHNICAL,
  ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY,
  ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN,
]);

/** The document types that belong to the Library's Proposals section. */
export const PROPOSAL_DOCUMENT_TYPES = Object.freeze([
  ISSUED_DOCUMENT_TYPE.PROPOSAL,
  ISSUED_DOCUMENT_TYPE.COMPARISON,
]);

/**
 * The paper a composition prints on, when it is not the report default.
 *
 * A report page frame is the printable CONTENT area: the report stylesheets
 * declare a 12mm page margin, so a frame measures A4 less that margin and is
 * placed back inside it. A proposal pack paints the whole A4 sheet itself its
 * print stylesheet declares `@page { margin: 0 }` and the cover bleeds to the
 * paper edge — so its frames are full A4, stored full-bleed, exactly as printed.
 */
const PROPOSAL_PAGE_FRAME = Object.freeze({
  widthMm: 210,
  heightMm: 297,
  marginMm: 0,
});

/**
 * The paper the Current Speaker Design schedule prints on. Its own print
 * stylesheet declares `@page { size: A4; margin: 16mm }`, so its page frame is
 * the printable content area of A4 inside that margin — the schedule is measured
 * and stored exactly as it prints.
 *
 * One frame is a whole sheet's worth of content: a schedule that fits the frame
 * is one page, and a longer schedule continues onto further frames, allocated by
 * the schedule's own composer (below). The 16mm margin is the paper margin, so
 * the bottom clearance on every page is the frame itself.
 */
const SPEAKER_DESIGN_PAGE_FRAME = Object.freeze({
  widthMm: 178,
  heightMm: 265,
  marginMm: 16,
});

/**
 * The print composition each document is exported from.
 *
 * nodeSelector — the mounted print composition the export prints. The capture
 *   clones exactly this node, so the stored document holds what was printed.
 * pageSelector — the page frames inside that node. Each frame becomes exactly
 *   one page of the stored PDF, so the stored document is page-for-page the
 *   document that was printed.
 * bodyClass    — the export body class the composition's print layout is
 *   written against, applied to the capture document so the page frames lay
 *   out at their printed size.
 * pageFrame    — the paper those frames are measured and stored on. Omitted by
 *   the reports, which use the capture's content-area default (A4 less the 12mm
 *   page margin) — the paper every stored report PDF has always used.
 * paginate     — true for a composition that is paginated by its own content
 *   rather than by a fixed page frame: the proposal pack, whose sections are as
 *   tall as their copy. A section taller than one sheet is continued onto
 *   further pages, whole blocks at a time, so the stored document holds every
 *   page, its content and its design. A report page frame is fixed-height and
 *   must fit exactly, so a report is never re-paginated.
 */
export const ISSUED_DOCUMENT_COMPOSITION = Object.freeze({
  // The consolidated Project Report prints from the same mounted composition the
  // Project Report route renders — the same node, the same page frames and the
  // same export body class.
  [ISSUED_DOCUMENT_TYPE.PROJECT]: Object.freeze({
    nodeSelector: '.client-report-root',
    pageSelector: '.client-report-page',
    bodyClass: 'client-report-printing',
  }),
  [ISSUED_DOCUMENT_TYPE.VISUAL]: Object.freeze({
    nodeSelector: '.client-report-root',
    pageSelector: '.client-report-page',
    bodyClass: 'client-report-printing',
  }),
  [ISSUED_DOCUMENT_TYPE.TECHNICAL]: Object.freeze({
    nodeSelector: '.print-only.print-keep-layout',
    pageSelector: [
      '.rp22-report .report-page-block',
      '.rp22-report .tech-param-page',
      '.rp22-report .rp22-param-page',
      '.rp22-report .rp22-bass-graph-page',
    ].join(', '),
    bodyClass: '',
  }),
  // The schedule is not a mounted page of the app: its node is built from the
  // version's own speaker design and handed to the capture explicitly, so the
  // stored copy is produced from the same markup the panel prints.
  //
  // Its pages are its own content, so it declares a page composer: the schedule
  // is composed into one A4 content frame when it fits, and into further frames
  // when it is longer. The frames become the pages; before the composer runs the
  // schedule itself is the single frame, so a document is never left unpaged.
  [ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN]: Object.freeze({
    nodeSelector: '.speaker-design-schedule',
    pageSelector: '.speaker-design-page, .speaker-design-schedule',
    bodyClass: 'speaker-design-export-mode',
    pageFrame: SPEAKER_DESIGN_PAGE_FRAME,
    pageComposer: ISSUED_DOCUMENT_PAGE_COMPOSER.SPEAKER_DESIGN,
    paginate: false,
  }),
  [ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
    pageFrame: PROPOSAL_PAGE_FRAME,
    paginate: false,
  }),
  [ISSUED_DOCUMENT_TYPE.PROPOSAL]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
    pageFrame: PROPOSAL_PAGE_FRAME,
    paginate: false,
  }),
  [ISSUED_DOCUMENT_TYPE.COMPARISON]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
    pageFrame: PROPOSAL_PAGE_FRAME,
    paginate: false,
  }),
});

/** The document type a proposal's report type exports as. */
export function documentTypeForProposalType(proposalType) {
  switch (proposalType) {
    case 'comparison': return ISSUED_DOCUMENT_TYPE.COMPARISON;
    case 'system_summary': return ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY;
    default: return ISSUED_DOCUMENT_TYPE.PROPOSAL;
  }
}

export function issuedDocumentLabel(documentType) {
  return ISSUED_DOCUMENT_LABEL[documentType] || 'Document';
}