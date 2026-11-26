/**
 * versionSwitchSafety.js
 * ----------------------
 * The rule that decides whether opening another design version may happen
 * straight away, or must first ask the designer about unsaved work.
 *
 * Pure: no reads, no writes, no React.
 */

/** The three answers the unsaved-changes question offers. */
export const VERSION_SWITCH_ACTION = Object.freeze({
  SAVE_AND_OPEN: 'save_and_open',
  OPEN_WITHOUT_SAVING: 'open_without_saving',
  CANCEL: 'cancel',
});

/** Autosave states that mean work exists which is not yet in the database. */
const UNSAVED_AUTOSAVE_STATES = Object.freeze(['dirty', 'saving', 'error']);

/**
 * Does the open design version hold changes that are not saved?
 *
 * "saved" (autosave complete), "idle" (nothing to write) and "hydrating" are
 * settled states: opening another version from any of them must not show an
 * unnecessary warning.
 */
export function hasUnsavedVersionChanges(autosaveStatus) {
  return UNSAVED_AUTOSAVE_STATES.includes(autosaveStatus);
}

/** The exact question shown before work could be lost. */
export function versionSwitchQuestion(versionName) {
  const name = (typeof versionName === 'string' ? versionName.trim() : '') || 'this version';
  return `You have unsaved changes in ${name}. Save before opening another version?`;
}

/** Is the version being opened the one already open? */
export function isSameVersion(currentVersionId, targetVersionId) {
  if (!currentVersionId || !targetVersionId) return false;
  return String(currentVersionId) === String(targetVersionId);
}

/** Wait for the existing writer, then save the latest render's design. */
export async function saveBeforeVersionCreation({
  save, readBucket, assertScope, timeoutMs = 15000,
  now = () => Date.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  const deadline = now() + timeoutMs;
  assertScope();
  while (readBucket()?.inFlight) {
    if (now() >= deadline) throw new Error('The current save is still running. Your changes remain open; retry when saving finishes.');
    await wait(50);
    assertScope();
  }
  const result = await save();
  assertScope();
  if (result?.success !== true) throw new Error(result?.error || 'The design could not be confirmed saved. Your changes remain open.');
  if (readBucket()?.inFlight || readBucket()?.dirty) {
    throw new Error('The design changed while saving. Your latest changes remain open; save them before creating an option.');
  }
}
