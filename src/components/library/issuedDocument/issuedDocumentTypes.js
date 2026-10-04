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
  VISUAL: 'visual',
  TECHNICAL: 'technical',
  SYSTEM_DESIGN_SUMMARY: 'system_design_summary',
  PROPOSAL: 'proposal',
  COMPARISON: 'comparison',
});

export const ISSUED_DOCUMENT_LABEL = Object.freeze({
  [ISSUED_DOCUMENT_TYPE.VISUAL]: 'Visual Report',
  [ISSUED_DOCUMENT_TYPE.TECHNICAL]: 'Technical Report',
  [ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY]: 'System Design Summary',
  [ISSUED_DOCUMENT_TYPE.PROPOSAL]: 'Proposal',
  [ISSUED_DOCUMENT_TYPE.COMPARISON]: 'System Design Comparison',
});

/** The document types that belong to the Library's Generated Reports section. */
export const REPORT_DOCUMENT_TYPES = Object.freeze([
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
 */
export const ISSUED_DOCUMENT_COMPOSITION = Object.freeze({
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
  }),
  [ISSUED_DOCUMENT_TYPE.PROPOSAL]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
  }),
  [ISSUED_DOCUMENT_TYPE.COMPARISON]: Object.freeze({
    nodeSelector: '.proposal-print-portal',
    pageSelector: '.proposal-print-portal > .proposal-print-cover, .proposal-print-portal > .pp-page',
    bodyClass: 'proposal-export-mode',
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