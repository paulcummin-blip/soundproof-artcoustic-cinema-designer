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
});

export const ISSUED_DOCUMENT_LABEL = Object.freeze({
  [ISSUED_DOCUMENT_TYPE.PROJECT]: 'Project Report',
  [ISSUED_DOCUMENT_TYPE.VISUAL]: 'Visual Report',
  [ISSUED_DOCUMENT_TYPE.TECHNICAL]: 'Technical Report',
  [ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY]: 'System Design Summary',
  [ISSUED_DOCUMENT_TYPE.PROPOSAL]: 'Proposal',
  [ISSUED_DOCUMENT_TYPE.COMPARISON]: 'System Design Comparison',
});

/** The document types that belong to the Library's Generated Reports section. */
export const REPORT_DOCUMENT_TYPES = Object.freeze([
  ISSUED_DOCUMENT_TYPE.PROJECT,
  ISSUED_DOCUMENT_TYPE.VISUAL,
  ISSUED_DOCUMENT_TYPE.TECHNICAL,
  ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY,
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
  [ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
    pageFrame: PROPOSAL_PAGE_FRAME,
  }),
  [ISSUED_DOCUMENT_TYPE.PROPOSAL]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
    pageFrame: PROPOSAL_PAGE_FRAME,
  }),
  [ISSUED_DOCUMENT_TYPE.COMPARISON]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
    pageFrame: PROPOSAL_PAGE_FRAME,
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