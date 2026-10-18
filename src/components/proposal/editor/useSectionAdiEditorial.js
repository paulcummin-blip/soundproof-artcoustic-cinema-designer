/**
 * useSectionAdiEditorial
 * ----------------------
 * The Proposal Editor's one ADI editorial action on a section's wording, and every
 * way it can end.
 *
 * It is the browser's half of the shared backend action and it holds no rule of its
 * own. Which copy may be improved, whether an approved revision stops counting and
 * whether a rewrite is saved at all are resolved on the server — by the editorial
 * pass, the meaning-conservation gate and the surface's own validator. This hook
 * asks, and it reports what came back in one plain line.
 *
 * TWO HALVES OF ONE HIGHLIGHTED EDIT. ADI improves the text the designer highlighted
 * and returns it WITHOUT saving anything. The editor puts it back in its place and
 * calls again with the copy it produced; the server proves that nothing outside the
 * highlighted text changed and only then saves it.
 *
 * Every action that writes re-reads the sections from the server, so the body, the
 * stamps and the editorial marker the Undo action reads are always the stored ones —
 * and so the approval state is resolved again from the wording that is actually
 * there.
 *
 * It is kept out of the editor page so the page stays readable.
 */

import { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { saveAdiEditorialRejection } from '@/components/adi/adiEditorialRejectionStore';

export default function useSectionAdiEditorial({
  proposal = null,
  archived = false,
  activeSection = null,
  onApplied = null,
} = {}) {
  const [busySectionId, setBusySectionId] = useState(null);
  const [notice, setNotice] = useState(null);

  const invokeAdiEditorial = useCallback((payload) => (
    base44.functions.invoke('improveAdiWording', {
      surface: 'proposal_section',
      proposal_id: proposal?.id || null,
      ...payload,
    })
  ), [proposal?.id]);

  const report = useCallback((sectionId, message, busy = false) => {
    setNotice({ sectionId, message: message || null, busy });
  }, []);

  /**
   * Hold whatever refusal this response carried. A refusal writes nothing, so the
   * response is the only copy of what was proposed and why it was refused; it is
   * held for the session for a master admin to read. A dealer's response carries no
   * diagnostic, so nothing is held for them and nothing is shown.
   */
  const holdDiagnostics = useCallback((data, error) => {
    saveAdiEditorialRejection(
      data?.diagnostics || error?.response?.data?.diagnostics || null,
    );
  }, []);

  /** The shared half: one action, one section, one line about how it ended. */
  const run = useCallback(async ({ sectionId, payload, fallback }) => {
    setAdiBusySectionIdSafe(setBusySectionId, sectionId);
    report(sectionId, null);
    try {
      const response = await invokeAdiEditorial(payload);
      const data = response?.data || {};
      holdDiagnostics(data);
      report(sectionId, data.ok === true ? data.message : (data.error || fallback));
      return data;
    } catch (error) {
      holdDiagnostics(null, error);
      report(
        sectionId,
        error?.response?.data?.error || error?.response?.data?.message || fallback,
      );
      return null;
    } finally {
      setBusySectionId(null);
    }
  }, [holdDiagnostics, invokeAdiEditorial, report]);

  /**
   * The whole section: the copy is improved and saved, and the copy it replaced is
   * kept behind it, so Undo can put it back exactly.
   */
  const improveSection = useCallback(async (section) => {
    if (!section || archived) return null;
    const data = await run({
      sectionId: section.id,
      payload: { action: 'improve', mode: 'section', section_id: section.id },
      fallback: 'ADI could not change the wording, so it is unchanged.',
    });
    if (data?.ok === true && data.applied === true && onApplied) await onApplied();
    return data;
  }, [archived, onApplied, run]);

  /** Undo: the exact wording ADI replaced, put back as it was. */
  const undoSection = useCallback(async (section) => {
    if (!section || archived) return null;
    const data = await run({
      sectionId: section.id,
      payload: { action: 'undo', section_id: section.id },
      fallback: 'The earlier wording could not be put back.',
    });
    if (data?.ok === true && data.applied === true && onApplied) await onApplied();
    return data;
  }, [archived, onApplied, run]);

  /**
   * The highlighted text alone: improved on its own and NOT saved yet. The editor
   * puts it back in its place and calls applySelection with the copy it produced.
   */
  const improveSelection = useCallback(async (selectionText) => {
    if (archived || !activeSection) return null;
    report(activeSection.id, null, true);
    try {
      const response = await invokeAdiEditorial({
        action: 'improve',
        mode: 'selection',
        section_id: activeSection.id,
        selection_text: selectionText,
      });
      const data = response?.data || {};
      holdDiagnostics(data);
      report(activeSection.id, data.ok === true ? data.message : data.error);
      return data;
    } catch (error) {
      holdDiagnostics(null, error);
      report(
        activeSection.id,
        error?.response?.data?.error || 'ADI could not be reached, so the wording is unchanged.',
      );
      return null;
    }
  }, [activeSection, archived, holdDiagnostics, invokeAdiEditorial, report]);

  /**
   * The second half: the editor's own copy, with the improved highlighted text in
   * it, is handed over to be saved. The server proves that nothing outside the
   * highlighted text changed before anything is written.
   */
  const applySelection = useCallback(async ({ selectionText, improvedSelection, body }) => {
    if (archived || !activeSection) return null;
    try {
      const response = await invokeAdiEditorial({
        action: 'improve',
        mode: 'selection',
        section_id: activeSection.id,
        selection_text: selectionText,
        improved_selection: improvedSelection,
        body_text: body,
      });
      const data = response?.data || {};
      holdDiagnostics(data);
      report(
        activeSection.id,
        data.ok === true
          ? data.message
          : (data.error || 'The highlighted wording was not saved, so the copy is unchanged.'),
      );
      if (data.ok === true && data.applied === true && onApplied) await onApplied();
      return data;
    } catch (error) {
      holdDiagnostics(null, error);
      report(
        activeSection.id,
        error?.response?.data?.error || 'The highlighted wording was not saved, so the copy is unchanged.',
      );
      return null;
    }
  }, [activeSection, archived, holdDiagnostics, invokeAdiEditorial, onApplied, report]);

  return {
    notice,
    busySectionId,
    improveSection,
    undoSection,
    improveSelection,
    applySelection,
    dismissNotice: useCallback(() => setNotice(null), []),
  };
}

/** Kept as a one-liner so the busy section is cleared by exactly one place. */
function setAdiBusySectionIdSafe(setBusy, sectionId) {
  setBusy(sectionId);
}