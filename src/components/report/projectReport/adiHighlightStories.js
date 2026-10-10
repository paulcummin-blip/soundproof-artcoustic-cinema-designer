/**
 * adiHighlightStories.js
 * ----------------------
 * The ADI Design Highlights selector's story builders.
 *
 * This file holds NO implementation. Since the shared strength-authority move,
 * the ONE set of story builders, ranking and omission audit lives in
 * base44/shared/strengthStories.js (with the evidence reads in
 * base44/shared/strengthStoryEvidence.js) and reaches the report through the
 * root `shared/` re-export.
 *
 * The report page and the proposal writer therefore build, admit, rank and audit
 * the SAME strengths from the SAME evidence reads, and the report's own copy is
 * unchanged by the move.
 *
 * Pure: no React, no fetching, no side effects. Read-only throughout.
 */

export * from '../../../../shared/strengthStories.js';
export { default } from '../../../../shared/strengthStories.js';