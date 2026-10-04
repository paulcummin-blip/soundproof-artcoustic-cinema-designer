/**
 * proposalEditorStateAuthority.js
 * ------------------------------
 * The one place that decides what the Proposal Editor shows while the document
 * itself is not on screen. The editor must never be blank: it loads, it waits,
 * or it states exactly what went wrong and what to do next.
 *
 * Pure: no React, no fetching, no side effects. It reads the proposal record and
 * the stored sections it is given and names the state.
 *
 * States, decided in this order:
 *   loading             the proposal is being read
 *   not_found           no proposal with this reference exists
 *   load_failed         the proposal could not be read
 *   generating          the record exists; its sections are still being written
 *   generation_failed   the record exists but no written content was ever saved
 *   no_sections         the record exists and no sections were created
 *   unreadable_sections sections exist but none reads as a report section
 *   ready               the document is there to read and edit
 *
 * A proposal whose generation failed keeps its record: the state names the
 * failure and offers the recovery actions rather than showing an empty page.
 */

export const PROPOSAL_EDITOR_STATE = Object.freeze({
  LOADING: 'loading',
  NOT_FOUND: 'not_found',
  LOAD_FAILED: 'load_failed',
  GENERATING: 'generating',
  GENERATION_FAILED: 'generation_failed',
  NO_SECTIONS: 'no_sections',
  UNREADABLE_SECTIONS: 'unreadable_sections',
  READY: 'ready',
});

/** How many times the editor re-reads a proposal that is still generating. */
export const GENERATION_POLL_LIMIT = 20;

const TAG = /<[^>]*>/g;
const BLANK = /&nbsp;/g;

/** The plain text of a stored section body. */
export function sectionPlainText(body) {
  if (typeof body !== 'string') return '';
  return body.replace(TAG, ' ').replace(BLANK, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Whether a section carries written content.
 * The Cover and Project Images sections are legitimately empty: they carry a
 * cover and imagery, never generated prose, so they never count as content.
 */
export function sectionHasWrittenBody(section) {
  if (!section) return false;
  const type = section.section_type;
  if (type === 'cover' || type === 'room_images') return false;
  return sectionPlainText(section.body).length > 0;
}

/** How many sections of a proposal carry written content. */
export function countWrittenSections(sections) {
  return (Array.isArray(sections) ? sections : []).filter(sectionHasWrittenBody).length;
}

/**
 * The notice shown above the document when the proposal's own context could not
 * be read in full. The saved proposal content is still shown: a context problem
 * is stated, never used to blank the page.
 */
export function resolveProposalContextNotice({ projectReadFailed = false, versionReadFailed = false } = {}) {
  if (projectReadFailed && versionReadFailed) {
    return 'The linked project and design version could not be read. The saved proposal content is shown.';
  }
  if (projectReadFailed) {
    return 'The linked project could not be read. The saved proposal content is shown.';
  }
  if (versionReadFailed) {
    return 'A linked design version could not be read, so it is not named on this document.';
  }
  return null;
}

const COPY = Object.freeze({
  [PROPOSAL_EDITOR_STATE.LOADING]: {
    title: 'Loading proposal…',
    message: 'Reading the saved proposal and its sections.',
  },
  [PROPOSAL_EDITOR_STATE.NOT_FOUND]: {
    title: 'Proposal not found',
    message: 'No proposal with this reference exists. It may have been deleted.',
  },
  [PROPOSAL_EDITOR_STATE.LOAD_FAILED]: {
    title: 'Proposal could not be loaded',
    message: 'The saved proposal could not be read.',
  },
  [PROPOSAL_EDITOR_STATE.GENERATING]: {
    title: 'Creating proposal sections…',
    message: 'The proposal is saved and its sections are being written. The editor opens as soon as they are ready.',
  },
  [PROPOSAL_EDITOR_STATE.GENERATION_FAILED]: {
    title: 'Proposal generation failed',
    message: 'The proposal was created but no written sections were saved, so there is nothing to show yet.',
  },
  [PROPOSAL_EDITOR_STATE.NO_SECTIONS]: {
    title: 'No sections were created for this proposal',
    message: 'This proposal has no sections at all, so there is nothing to read or export.',
  },
  [PROPOSAL_EDITOR_STATE.UNREADABLE_SECTIONS]: {
    title: 'This proposal’s sections could not be read',
    message: 'The stored sections do not match any report section, so the document cannot be shown.',
  },
});

/**
 * Resolve the state the editor shows.
 *
 * @returns {{
 *   state: string, title: string, message: string, reason: string|null,
 *   showSpinner: boolean,
 *   actions: { retry: boolean, regenerate: boolean, return: boolean },
 * }}
 */
export function resolveProposalEditorState({
  loading = false,
  loadError = null,
  loadErrorDetail = null,
  proposal = null,
  sections = [],
  readableSections = null,
  timedOut = false,
} = {}) {
  const list = Array.isArray(sections) ? sections : [];
  const readable = Array.isArray(readableSections) ? readableSections : list;

  const build = (state, extra = {}) => {
    const copy = COPY[state] || COPY[PROPOSAL_EDITOR_STATE.LOAD_FAILED];
    return {
      state,
      title: copy.title,
      message: copy.message,
      reason: null,
      showSpinner: state === PROPOSAL_EDITOR_STATE.LOADING
        || state === PROPOSAL_EDITOR_STATE.GENERATING,
      actions: {
        retry: state === PROPOSAL_EDITOR_STATE.LOAD_FAILED
          || state === PROPOSAL_EDITOR_STATE.NOT_FOUND
          || state === PROPOSAL_EDITOR_STATE.GENERATION_FAILED,
        regenerate: state === PROPOSAL_EDITOR_STATE.GENERATION_FAILED
          || state === PROPOSAL_EDITOR_STATE.NO_SECTIONS
          || state === PROPOSAL_EDITOR_STATE.UNREADABLE_SECTIONS,
        // There is always a way back out of the editor.
        return: true,
      },
      ...extra,
    };
  };

  if (loading && !proposal) return build(PROPOSAL_EDITOR_STATE.LOADING);

  if (loadError === 'not_found') return build(PROPOSAL_EDITOR_STATE.NOT_FOUND);
  if (loadError) {
    return build(PROPOSAL_EDITOR_STATE.LOAD_FAILED, {
      reason: loadErrorDetail || null,
    });
  }
  if (!proposal) return build(PROPOSAL_EDITOR_STATE.NOT_FOUND);

  const status = proposal.status || null;
  const written = countWrittenSections(list);

  // Still being written: wait, and re-read until it settles or the wait times out.
  if (status === 'generating' && written === 0) {
    if (timedOut) {
      return build(PROPOSAL_EDITOR_STATE.GENERATION_FAILED, {
        reason: 'Generation did not finish. No written sections were saved.',
      });
    }
    return build(PROPOSAL_EDITOR_STATE.GENERATING);
  }

  if (list.length === 0) {
    // A record with no sections at all: generation never wrote them.
    return build(status === 'draft'
      ? PROPOSAL_EDITOR_STATE.GENERATION_FAILED
      : PROPOSAL_EDITOR_STATE.NO_SECTIONS);
  }

  if (readable.length === 0) return build(PROPOSAL_EDITOR_STATE.UNREADABLE_SECTIONS);

  if (written === 0) {
    return build(PROPOSAL_EDITOR_STATE.GENERATION_FAILED, {
      reason: 'Every stored section is empty.',
    });
  }

  return build(PROPOSAL_EDITOR_STATE.READY);
}