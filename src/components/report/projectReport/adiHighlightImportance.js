/**
 * adiHighlightImportance.js
 * -------------------------
 * The ADI Design Highlights selector's importance authority.
 *
 * This file holds NO implementation. Since the shared strength-authority move,
 * the ONE authority lives in base44/shared/strengthImportance.js and reaches the
 * report through the root `shared/` re-export. There is therefore no second
 * importance table, no second eligibility rule and no second spec-tier
 * classifier — the report's ADI Design Highlights page and the proposal writer's
 * strength selection rank from the same implementation, so they can never
 * disagree about which results matter.
 *
 * Consumers (the selector, audit panels and tests) import exactly the names they
 * always did; they now resolve to the canonical module.
 *
 * Pure: no React, no DOM, no side effects. Read-only throughout.
 */

export * from '../../../../shared/strengthImportance.js';
export { default } from '../../../../shared/strengthImportance.js';