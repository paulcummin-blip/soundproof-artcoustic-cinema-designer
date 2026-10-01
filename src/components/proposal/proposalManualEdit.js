/**
 * proposalManualEdit.js
 * ---------------------
 * The manual-edit authority for proposal text blocks.
 *
 * Manual editing is the designer's own wording change. The Edit control makes
 * one block editable, Save commits that block only, and Cancel restores exactly
 * the text that was there when editing began. It never calls the AI, never
 * touches calculated values, and never writes more than the one section.
 *
 * A section that carries a manual edit is flagged so the editor can show the
 * "Manual edit" indicator and ask before a regeneration replaces it.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

export const MANUAL_EDIT_LABEL = 'Manual edit';

/**
 * True when the stored text was written by hand after the last generation.
 * A regeneration replaces the text, so the section stops being flagged.
 *
 * @param {Object|null} section — ProposalSection record
 * @returns {boolean}
 */
export function isManuallyEdited(section) {
  if (!section || !section.last_user_edited_at) return false;
  const edited = Date.parse(section.last_user_edited_at);
  if (!Number.isFinite(edited)) return false;
  const generated = Date.parse(section.last_gpt_generated_at || '');
  return !Number.isFinite(generated) || edited >= generated;
}

/**
 * Regeneration replaces stored copy, so it is confirmed first when the section
 * is locked or carries a manual edit. This is the only path that may overwrite
 * hand-written text, and it always requires the designer's confirmation.
 *
 * @param {Object|null} section — ProposalSection record
 * @returns {boolean}
 */
export function requiresRegenerationConfirm(section) {
  return Boolean(section?.locked) || isManuallyEdited(section);
}