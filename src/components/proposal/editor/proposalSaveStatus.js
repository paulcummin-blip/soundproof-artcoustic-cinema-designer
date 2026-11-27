/**
 * proposalSaveStatus.js
 * ---------------------
 * The one save-status vocabulary the Proposal Editor uses for every persistence
 * surface: section body autosave, section reordering, and the discrete field
 * saves (visibility, lock, dealer notes, client brief).
 *
 * Reused everywhere so a dealer reads one consistent set of states — Saving…,
 * Saved, Not saved — and never a second, parallel framework. Imported by the
 * editor page, the reorder save queue, and the tracked-save hook.
 */
export const SAVE_STATUS = Object.freeze({
  IDLE: 'idle',
  SAVING: 'saving',
  SAVED: 'saved',
  FAILED: 'failed',
  UNSAVED: 'unsaved',
});

export default SAVE_STATUS;