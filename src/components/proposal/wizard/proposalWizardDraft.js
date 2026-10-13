/**
 * proposalWizardDraft.js
 * ----------------------
 * The designer's proposal progress, kept while they step out of the wizard.
 *
 * Sound Proof sometimes needs the designer to finish something in their design —
 * record the current assessment, or bring a Project Report up to date. That is a
 * short trip to another page, and the proposal they were creating must survive
 * it: the chosen project, the report type, the versions, the brief, the
 * clarification answers and the step they were on all come back exactly as they
 * were, and a Generate they had already asked for continues by itself.
 *
 * Session-scoped on purpose: it describes the browser session that was creating
 * the proposal, not a saved document. It is cleared the moment a proposal is
 * created from it.
 */

const STORAGE_KEY = 'sp_proposal_wizard_draft_v1';

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The draft the designer left behind, or null when there is none. */
export function readWizardDraft() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Keep the designer's progress. Nothing is written without a project. */
export function writeWizardDraft(draft) {
  const store = storage();
  if (!store || !draft?.projectId) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // A session that cannot store a draft loses nothing but the resume shortcut.
  }
}

/** For the moment a draft belongs to another project than the one now open. */
export function clearWizardDraft() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Whether the designer is mid-way through a proposal that Sound Proof was still
 * preparing — the case the wizard must reopen for on their return.
 */
export function hasResumableDraft() {
  const draft = readWizardDraft();
  return !!draft?.pendingGenerate;
}

export default readWizardDraft;