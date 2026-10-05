import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getSectionDef, getSectionLabel, resolveSectionTitle } from '@/components/proposal/proposalSections';
import KeyPerformanceHighlightsTable from '@/components/proposal/KeyPerformanceHighlightsTable';
import { compactViewingResult } from '@/components/proposal/print/snapshotViewingRows';
import { getProposalTypeLabel } from '@/components/proposal/proposalTypes';
import useRecoveredComparisonTable from '@/components/proposal/useRecoveredComparisonTable';
import { resolveProposalComparison, isCompleteComparisonTable } from '@/components/proposal/comparisonDisplayAuthority';
import ComparisonEvidenceState from '@/components/proposal/ComparisonEvidenceState';
import InlineRichTextEditor from '@/components/proposal/InlineRichTextEditor';
import SectionToolbar from '@/components/proposal/SectionToolbar';
import DealerNotesPanel from '@/components/proposal/DealerNotesPanel';
import ProposalSectionNav from '@/components/proposal/ProposalSectionNav';
import { isArchived, getRestoreStatus } from '@/components/proposal/proposalLifecycle';
import {
  MANUAL_EDIT_LABEL,
  isManuallyEdited,
  requiresRegenerationConfirm,
} from '@/components/proposal/proposalManualEdit';
import ProposalTypographyStyles from '@/components/proposal/typography/ProposalTypographyStyles';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';
import { resolveDealerBrandPresentation } from '@/components/account/defaultDealerBranding';
import { resolveDealerIdentityName } from '@/components/account/dealerIdentityDisplay';
import ProposalWorkspaceToolbar from '@/components/proposal/ProposalWorkspaceToolbar';
import ProposalCoverPage from '@/components/proposal/cover/ProposalCoverPage';
import ProjectImagesBlock, { projectGalleryImages } from '@/components/proposal/ProjectImagesBlock';
import { prepareSectionBody } from '@/components/proposal/sectionBodyAuthority';
import { isHighChannelDesign } from '@/components/proposal/highChannelLayoutAuthority';
import ProposalPrintDocument from '@/components/proposal/export/ProposalPrintDocument';
import ProposalPrintStyles from '@/components/proposal/export/ProposalPrintStyles';
import { useProposalExport } from '@/components/proposal/export/useProposalExport';
import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import { documentTypeForProposalType } from '@/components/library/issuedDocument/issuedDocumentTypes';
import { resolveProposalExportSource } from '@/components/library/issuedDocument/proposalExportSource';
import { resolveCoverAsset, resolvePackImages } from '@/components/library/imageScopeAuthority';
import { buildVersionNameMap } from '@/components/library/libraryVersionLabels';
import { resolveReportFilenameDetails, logReportExportIdentity } from '@/components/report/reportFilenameIdentity';
import { proposalReportTypeToken } from '@/components/report/reportPdfTitle';
import { Loader2, ChevronLeft, Archive, RotateCcw } from 'lucide-react';
import ProposalEditorState from '@/components/proposal/editor/ProposalEditorState';
import ProposalRenderBoundary from '@/components/proposal/editor/ProposalRenderBoundary';
import {
  PROPOSAL_EDITOR_STATE,
  GENERATION_POLL_LIMIT,
  resolveProposalEditorState,
  resolveProposalContextNotice,
} from '@/components/proposal/editor/proposalEditorStateAuthority';

const SAVE_STATUS = { IDLE: 'idle', SAVING: 'saving', SAVED: 'saved', FAILED: 'failed', UNSAVED: 'unsaved' };

/**
 * Proposal Editor — the publishing tool.
 *
 * Loads a proposal by ID from the URL query param `proposalId`.
 * The Proposal Editor is no longer tied to the active project; proposals
 * are created from the Proposal Centre wizard and opened here by ID.
 */
export default function ProposalEditor() {
  const [searchParams] = useSearchParams();
  const proposalId = searchParams.get('proposalId');
  const navigate = useNavigate();

  const [proposal, setProposal] = useState(null);
  const [sections, setSections] = useState([]);
  const [activeSectionKey, setActiveSectionKey] = useState(null);
  const [loading, setLoading] = useState(true);
  // Why the proposal could not be read, stated plainly rather than left blank.
  const [loadError, setLoadError] = useState(null);
  const [loadErrorDetail, setLoadErrorDetail] = useState(null);
  // How long the editor has waited for a generating proposal's sections.
  const [pollCount, setPollCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [saveStatuses, setSaveStatuses] = useState({});
  const [dirtySections, setDirtySections] = useState(new Set());
  const [regenerating, setRegenerating] = useState(null);
  const [showProperties, setShowProperties] = useState(false);
  const [clientBrief, setClientBrief] = useState('');
  const [showClientBrief, setShowClientBrief] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [projectContext, setProjectContext] = useState({
    projectName: null,
    clientName: null,
    dealerName: null,
    filenameDealerName: null,
    filenameClientName: null,
    projectReference: null,
    coverImageUrl: null,
    heroImageUrl: null,
    logoUrl: null,
    // Every image uploaded or selected for the project. The cover is one of
    // them; the Project Images section shows the rest, in gallery order.
    projectImages: [],
  });

  // Proposal context — project/client/dealer metadata for the workspace toolbar
  // and the exported PDF cover. Read-only: it never changes proposal content.
  const loadProjectContext = useCallback(async (proposalRecord) => {
    const [projectResult, brandResult, coverResult, accountResult] = await Promise.allSettled([
      proposalRecord.project_id
        ? base44.entities.Project.filter({ id: proposalRecord.project_id })
        : Promise.resolve([]),
      proposalRecord.account_id
        ? base44.entities.BrandAsset.filter({ account_id: proposalRecord.account_id })
        : Promise.resolve([]),
      // Every image for the project, in one read: the cover and the Project
      // Images section are both resolved from the same gallery.
      proposalRecord.project_id
        ? base44.entities.ProposalAsset.filter({ project_id: proposalRecord.project_id })
        : Promise.resolve([]),
      proposalRecord.account_id
        ? base44.entities.Account.filter({ id: proposalRecord.account_id })
        : Promise.resolve([]),
    ]);
    const project = projectResult.status === 'fulfilled' ? projectResult.value?.[0] : null;
    const brand = brandResult.status === 'fulfilled' ? brandResult.value?.[0] : null;
    const projectImages = coverResult.status === 'fulfilled' ? (coverResult.value || []) : [];
    // The cover for THIS document: the covered version's own cover first, and
    // the project-wide cover when that version has none. A comparison opens with
    // the shared project-wide cover.
    const cover = resolveCoverAsset(projectImages, proposalVersionIds(proposalRecord));
    const account = accountResult.status === 'fulfilled' ? accountResult.value?.[0] : null;
    // Resolves the dealer's own hero/logo when set, otherwise the approved
    // Sound Proof / Artcoustic defaults — so the cover is always professional.
    const presentation = resolveDealerBrandPresentation(brand, proposalRecord.account_id);
    // Dealer identity is presented only for a partner/dealer account. Sound
    // Proof's own admin and internal accounts are platform identities and must
    // never appear as the dealer on a client-facing cover. The approved
    // Artcoustic default name is not a fallback either — Artcoustic is the
    // partner brand in the lockup, not the dealer.
    const dealerName = resolveDealerIdentityName(account, brand);
    // Every populated project identity field is carried into the exported
    // filename: dealer/account, project name, client name and reference.
    const filenameDetails = resolveReportFilenameDetails(project, account);
    logReportExportIdentity(filenameDetails, proposalReportTypeToken(proposalRecord.proposal_type));
    setProjectContext({
      projectName: project?.name || null,
      clientName: project?.client_name || null,
      dealerName,
      filenameDealerName: filenameDetails.dealerName,
      filenameClientName: filenameDetails.clientName,
      projectReference: project?.project_reference || null,
      coverImageUrl: cover?.file_url || null,
      heroImageUrl: presentation.heroBg,
      logoUrl: presentation.dealerLogo,
      projectImages,
    });
  }, []);

  // ── Load proposal + sections by ID ──
  const load = useCallback(async () => {
    if (!proposalId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const proposalRecord = await base44.entities.Proposal.get(proposalId);
      setProposal(proposalRecord);
      setLoadError(null);
      setLoadErrorDetail(null);
      if (proposalRecord) {
        setClientBrief(proposalRecord.client_brief || '');
        await loadProjectContext(proposalRecord);
        const sectionResults = await base44.entities.ProposalSection.filter({
          proposal_id: proposalRecord.id,
        });
        const sorted = (sectionResults || []).sort(
          (a, b) => (a.order_index || 0) - (b.order_index || 0)
        );
        setSections(sorted);
        if (sorted.length > 0 && !activeSectionKey) {
          // Open on the first section the editor can actually show.
          const firstReadable = sorted.find((s) => getSectionDef(s.section_type));
          setActiveSectionKey((firstReadable || sorted[0]).section_key);
        }
      }
    } catch (err) {
      // A failed read is stated, never swallowed into an empty page.
      const status = err?.response?.status ?? err?.status ?? null;
      setLoadError(status === 404 ? 'not_found' : 'load_failed');
      setLoadErrorDetail(err?.message || null);
      setProposal(null);
      setSections([]);
      console.error('Failed to load proposal:', err);
    } finally {
      setLoading(false);
    }
  }, [proposalId, loadProjectContext]);

  useEffect(() => {
    load();
  }, [load]);

  // A new proposal starts its own wait.
  useEffect(() => {
    setPollCount(0);
  }, [proposalId]);

  // ── Wait for the sections of a generating proposal ──
  // The editor re-reads the record until its sections are written, so it can
  // never open onto a proposal whose content has not been saved yet.
  useEffect(() => {
    if (proposal?.status !== 'generating') return undefined;
    if (pollCount >= GENERATION_POLL_LIMIT) return undefined;
    const timer = setTimeout(() => {
      setPollCount((count) => count + 1);
      load();
    }, 4000);
    return () => clearTimeout(timer);
  }, [proposal?.status, pollCount, load]);

  // ── Auto-save section body ──
  // One server-owned persistence path handles normal autosave and keepalive
  // teardown saves. A proposal becomes Edited only after the section write
  // succeeds; failed or superseded requests never clear the latest dirty draft.
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;
  const dirtySectionsRef = useRef(new Set());
  const dirtyDraftsRef = useRef({});
  const pendingSavesRef = useRef({});
  const unloadSavesRef = useRef({});
  const saveRequestIdRef = useRef(0);
  const savedIndicatorTimersRef = useRef({});
  // Manual edit keeps its own draft and baseline per section: the draft is what
  // Save commits, the baseline is what Cancel puts back.
  const editDraftsRef = useRef({});
  const editBaselinesRef = useRef({});
  const archivedRef = useRef(false);
  archivedRef.current = isArchived(proposal?.status);

  // Manual edit applies to one section at a time. Selecting another section
  // leaves edit mode and drops the draft, so Cancel semantics stay honest.
  useEffect(() => {
    setEditingSectionId(null);
    editDraftsRef.current = {};
    editBaselinesRef.current = {};
  }, [activeSectionKey]);

  const handleDirty = useCallback((sectionId, html, editedAt) => {
    if (archivedRef.current) return;
    dirtyDraftsRef.current[sectionId] = { html, editedAt };
    setDirtySections((prev) => {
      const next = new Set(prev);
      next.add(sectionId);
      dirtySectionsRef.current = next;
      return next;
    });
    setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.UNSAVED }));
  }, []);

  const persistSectionEdit = useCallback(async (sectionId, html, editedAt, keepalive = false) => {
    const payload = {
      proposal_id: proposalId,
      section_id: sectionId,
      html,
      edited_at: editedAt,
    };

    if (keepalive) {
      const response = await base44.functions.fetch('/persistProposalSectionEdit', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || `Save failed (${response.status})`);
      }
      return data;
    }

    const response = await base44.functions.invoke('persistProposalSectionEdit', payload);
    const data = response?.data ?? response;
    if (data?.error) throw new Error(data.error);
    return data;
  }, [proposalId]);

  const commitDraft = useCallback((sectionId, html, editedAt, keepalive = false) => {
    if (archivedRef.current || !sectionId || typeof html !== 'string') {
      return Promise.resolve({ ok: false });
    }

    const draft = {
      html,
      editedAt: editedAt || new Date().toISOString(),
    };
    dirtyDraftsRef.current[sectionId] = draft;

    if (
      keepalive &&
      unloadSavesRef.current[sectionId]?.html === draft.html &&
      unloadSavesRef.current[sectionId]?.editedAt === draft.editedAt
    ) {
      return unloadSavesRef.current[sectionId].promise;
    }

    const requestId = ++saveRequestIdRef.current;
    const request = { requestId, ...draft, keepalive, promise: null };
    setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.SAVING }));

    request.promise = (async () => {
      try {
        const result = await persistSectionEdit(sectionId, draft.html, draft.editedAt, keepalive);

        if (result?.proposal_status) {
          proposalRef.current = proposalRef.current
            ? { ...proposalRef.current, status: result.proposal_status }
            : proposalRef.current;
          setProposal((prev) => prev ? { ...prev, status: result.proposal_status } : prev);
        }

        const currentRequest = pendingSavesRef.current[sectionId];
        const latestDraft = dirtyDraftsRef.current[sectionId];
        const isCurrentRequest = currentRequest?.requestId === requestId;
        const isLatestDraft =
          latestDraft?.html === draft.html && latestDraft?.editedAt === draft.editedAt;

        if (isCurrentRequest) delete pendingSavesRef.current[sectionId];

        if (isLatestDraft || (isCurrentRequest && !latestDraft)) {
          if (isLatestDraft) delete dirtyDraftsRef.current[sectionId];
          setDirtySections((prev) => {
            const next = new Set(prev);
            next.delete(sectionId);
            dirtySectionsRef.current = next;
            return next;
          });
          setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.SAVED }));

          if (savedIndicatorTimersRef.current[sectionId]) {
            clearTimeout(savedIndicatorTimersRef.current[sectionId]);
          }
          savedIndicatorTimersRef.current[sectionId] = setTimeout(() => {
            setSaveStatuses((prev) => {
              if (prev[sectionId] !== SAVE_STATUS.SAVED) return prev;
              const next = { ...prev };
              delete next[sectionId];
              return next;
            });
            delete savedIndicatorTimersRef.current[sectionId];
          }, 2000);
        } else if (isCurrentRequest) {
          setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.UNSAVED }));
        }

        return { ok: true, result };
      } catch (err) {
        console.error('Save failed:', err);
        if (pendingSavesRef.current[sectionId]?.requestId === requestId) {
          delete pendingSavesRef.current[sectionId];
          if (dirtyDraftsRef.current[sectionId]) {
            setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.FAILED }));
          }
        }
        return { ok: false, error: err };
      } finally {
        if (unloadSavesRef.current[sectionId]?.requestId === requestId) {
          delete unloadSavesRef.current[sectionId];
        }
      }
    })();

    pendingSavesRef.current[sectionId] = request;
    if (keepalive) unloadSavesRef.current[sectionId] = request;
    return request.promise;
  }, [persistSectionEdit]);

  const handleBodySave = useCallback(
    (sectionId, html, editedAt) => commitDraft(sectionId, html, editedAt, false),
    [commitDraft]
  );

  const handleUnloadSave = useCallback(
    (sectionId, html, editedAt) => commitDraft(sectionId, html, editedAt, true),
    [commitDraft]
  );

  const flushDirtyDrafts = useCallback(async () => {
    const drafts = Object.entries(dirtyDraftsRef.current);
    if (drafts.length > 0) {
      const results = await Promise.all(
        drafts.map(([sectionId, draft]) =>
          commitDraft(sectionId, draft.html, draft.editedAt, false)
        )
      );
      return results.every((result) => result?.ok) &&
        Object.keys(dirtyDraftsRef.current).length === 0;
    }

    const pending = Object.values(pendingSavesRef.current)
      .map((request) => request?.promise)
      .filter(Boolean);
    if (pending.length === 0) return true;

    const results = await Promise.all(pending);
    return results.every((result) => result?.ok) &&
      Object.keys(dirtyDraftsRef.current).length === 0;
  }, [commitDraft]);

  useEffect(() => {
    const handleInternalNavigation = async (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;

      const hasUnsavedWork =
        Object.keys(dirtyDraftsRef.current).length > 0 ||
        Object.keys(pendingSavesRef.current).length > 0;
      if (!hasUnsavedWork) return;

      event.preventDefault();
      event.stopPropagation();
      const saved = await flushDirtyDrafts();
      if (saved) window.location.assign(destination.href);
    };

    document.addEventListener('click', handleInternalNavigation, true);
    return () => document.removeEventListener('click', handleInternalNavigation, true);
  }, [flushDirtyDrafts]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      const drafts = Object.entries(dirtyDraftsRef.current);
      const hasPending = drafts.length > 0 || Object.keys(pendingSavesRef.current).length > 0;
      if (!hasPending) return;

      drafts.forEach(([sectionId, draft]) => {
        handleUnloadSave(sectionId, draft.html, draft.editedAt);
      });
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      Object.values(savedIndicatorTimersRef.current).forEach((timer) => clearTimeout(timer));
      savedIndicatorTimersRef.current = {};
    };
  }, [handleUnloadSave]);

  // ── Section handlers ──
  const activeSection = sections.find((s) => s.section_key === activeSectionKey);

  const handleSetLock = async (section, locked) => {
    if (!section || archived) return;
    const updated = { ...section, locked };
    setSections((prev) => prev.map((s) => (s.id === section.id ? updated : s)));
    await base44.entities.ProposalSection.update(section.id, { locked });
  };

  const handleToggleLock = async () => {
    if (!activeSection || archived) return;
    await handleSetLock(activeSection, !activeSection.locked);
  };

  // ── Manual edit — one section, wording only, no AI ──
  const handleStartEdit = async (section) => {
    if (!section || archived) return;
    if (section.locked) {
      // Never silently unlock: the designer confirms first.
      const confirmed = window.confirm(
        'This section is locked. Unlock it to edit the wording by hand?'
      );
      if (!confirmed) return;
      await handleSetLock(section, false);
    }
    editBaselinesRef.current[section.id] = section.body || '';
    editDraftsRef.current[section.id] = null;
    setShowNotes(false);
    setEditingSectionId(section.id);
  };

  const handleEditDirty = useCallback((sectionId, html) => {
    editDraftsRef.current[sectionId] = html;
  }, []);

  const handleSaveEdit = async (section) => {
    if (!section || archived) return;
    const html = editDraftsRef.current[section.id];
    if (typeof html !== 'string' || html === section.body) {
      // Nothing changed: leave edit mode without writing.
      handleCancelEdit(section);
      return;
    }
    setSavingEdit(true);
    const editedAt = new Date().toISOString();
    const outcome = await commitDraft(section.id, html, editedAt, false);
    setSavingEdit(false);
    if (!outcome?.ok) return;
    setSections((prev) =>
      prev.map((s) =>
        s.id === section.id ? { ...s, body: html, last_user_edited_at: editedAt } : s
      )
    );
    editDraftsRef.current[section.id] = null;
    delete editBaselinesRef.current[section.id];
    setEditingSectionId(null);
  };

  const handleCancelEdit = (section) => {
    if (!section) return;
    const baseline = editBaselinesRef.current[section.id];
    editDraftsRef.current[section.id] = null;
    delete editBaselinesRef.current[section.id];
    setEditingSectionId(null);
    if (typeof baseline === 'string') {
      // Restore exactly the text that was there when editing began.
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, body: baseline } : s))
      );
    }
  };

  const handleToggleVisibility = async (sectionId) => {
    if (archived) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const updated = { ...section, is_enabled: !section.is_enabled };
    setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
    await base44.entities.ProposalSection.update(sectionId, { is_enabled: updated.is_enabled });
  };

  const handleReorder = async (reorderedSections) => {
    if (archived) return;
    setSections(reorderedSections);
    try {
      await base44.entities.ProposalSection.bulkUpdate(
        reorderedSections.map((s, i) => ({ id: s.id, order_index: i }))
      );
    } catch (err) {
      console.error('Reorder failed:', err);
    }
  };

  const handleSaveNotes = async (notes) => {
    if (!activeSection || archived) return;
    setSections((prev) =>
      prev.map((s) => (s.id === activeSection.id ? { ...s, dealer_notes: notes } : s))
    );
    await base44.entities.ProposalSection.update(activeSection.id, { dealer_notes: notes });
  };

  // ── Save Client Brief to Proposal record ──
  const handleSaveClientBrief = async () => {
    if (!proposal || archived) return;
    setSavingBrief(true);
    try {
      await base44.entities.Proposal.update(proposal.id, { client_brief: clientBrief });
      setSavingBrief(false);
    } catch (err) {
      console.error('Failed to save client brief:', err);
      setSavingBrief(false);
    }
  };

  // ── Archived read-only + restore ──
  const archived = isArchived(proposal?.status);

  const handleRestore = async () => {
    if (!proposal) return;
    setRestoring(true);
    try {
      const restoreStatus = getRestoreStatus(proposal.status, proposal.previous_status, true);
      const response = await base44.functions.invoke('transitionProposalStatus', {
        proposal_id: proposal.id,
        target_status: restoreStatus || 'edited',
      });
      if (response?.data?.error) {
        alert(response.data.error);
      } else {
        setProposal((prev) => prev ? { ...prev, status: response.data.status, previous_status: null } : prev);
      }
    } catch (err) {
      console.error('Restore failed:', err);
      alert('Failed to restore proposal. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // ── Regeneration — uses Current Report + Client Brief + Dealer Notes + Authoritative data ──
  const handleRegenerate = async (action) => {
    if (!activeSection || !proposal || archived) return;
    if (requiresRegenerationConfirm(activeSection)) {
      const message = activeSection.locked
        ? 'This section is locked. Regeneration will replace your manual edits. Continue?'
        : 'This section has a manual edit. Regeneration will replace it. Continue?';
      if (!window.confirm(message)) return;
    }
    // Regeneration replaces the stored copy, so manual edit mode ends first.
    setEditingSectionId(null);
    editDraftsRef.current = {};
    setRegenerating(activeSection.id);
    try {
      const response = await base44.functions.invoke('regenerateProposalSection', {
        proposal_id: proposal.id,
        section_id: activeSection.id,
        action,
        client_brief: clientBrief,
      });
      if (response?.data?.error) throw new Error(response.data.error);
      // Reload sections to pick up the regenerated content
      await load();
    } catch (err) {
      console.error('Regeneration failed:', err);
      alert('Regeneration failed. Please try again.');
    } finally {
      setRegenerating(null);
    }
  };

  // ── Version names — for the images this document may use ──
  // A version-specific image is only ever composed in with the version it
  // belongs to plainly named, so its name is read alongside the gallery.
  // A comparison saved before its comparison metadata was persisted recovers its
  // calculated table from each version's own frozen evidence, read-only.
  const storedComparison = resolveProposalComparison(proposal, sections);
  const hasStoredComparison = isCompleteComparisonTable(storedComparison);
  const recovery = useRecoveredComparisonTable({ proposal, hasStoredTable: hasStoredComparison });
  const comparisonTableForDisplay = resolveProposalComparison(proposal, sections, recovery.table);
  const comparisonBlocked = proposal?.proposal_type === 'comparison'
    && !isCompleteComparisonTable(comparisonTableForDisplay);
  const comparisonBlockReason = comparisonBlocked
    ? (recovery.status === 'loading' ? 'Reading frozen comparison evidence for both versions…'
      : 'Comparison evidence requires regeneration. Create a new comparison revision from both versions; the existing report is unchanged.')
    : null;

  const [versionNameById, setVersionNameById] = useState(new Map());
  useEffect(() => {
    const versionIds = proposalVersionIds(proposal);
    if (versionIds.length === 0) {
      setVersionNameById(new Map());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await base44.entities.ProjectVersion.filter(
          { id: { $in: versionIds } },
          { fields: ['version_name'], limit: 10 },
        );
        const records = Array.isArray(result) ? result : (result?.items || []);
        if (!cancelled) setVersionNameById(buildVersionNameMap(records));
      } catch (versionError) {
        // The name is a label only: an unreadable name leaves the image
        // unlabelled rather than showing a wrong one.
        console.warn('[ProposalEditor] version names unavailable:', versionError?.message || versionError);
      }
    })();
    return () => { cancelled = true; };
  }, [proposal?.selected_version_ids, proposal?.version_id]);

  // The exact saved version names this document is built from, in selection
  // order: the version name for a summary, every name for a comparison. Read
  // from the same stored records the images are labelled with, so the cover, the
  // printed pack and the exported filename all state one identity.
  const proposalVersionNames = useMemo(
    () => proposalVersionIds(proposal).map((versionId) => versionNameById.get(versionId)).filter(Boolean),
    [proposal?.selected_version_ids, proposal?.version_id, versionNameById],
  );

  // The images this document composes with: the versions it covers first, then
  // the project-wide gallery for anything they leave free.
  const packImages = useMemo(() => resolvePackImages({
    assets: projectContext.projectImages,
    versionIds: proposalVersionIds(proposal),
    versionNameById,
  }), [projectContext.projectImages, proposal?.selected_version_ids, proposal?.version_id, versionNameById]);

  // ── Export — full proposal PDF ──
  // Exports the whole proposal (every enabled section). Section-level export is
  // not implemented, so it is deliberately not exposed.
  const {
    exporting,
    error: exportError,
    blockedReason: exportBlockedReason,
    handleExport,
  } = useProposalExport({
    proposal,
    sections,
    comparisonBlockReason,
    projectName: projectContext.projectName,
    dealerName: projectContext.filenameDealerName,
    clientName: projectContext.filenameClientName,
    projectReference: projectContext.projectReference,
    // The exact saved version names this document was built from.
    versionNames: proposalVersionNames,
    // Exporting this proposal also stores the issued PDF in the project library.
    // Drafts and editable revisions stay in the Proposal Centre; only the PDF
    // that was actually exported becomes a library asset.
    issuedDocument: {
      projectId: proposal?.project_id || null,
      accountId: proposal?.account_id || null,
      documentType: documentTypeForProposalType(proposal?.proposal_type),
      title: proposal?.title || 'Proposal',
      resolveSource: () => resolveProposalExportSource(proposal),
    },
  });

  // ── Render ──
  // The editor states its condition before it draws the document: it is loading,
  // waiting for the sections, or reporting why it cannot show the proposal. It is
  // never blank, and every state carries a way back to the Proposal Centre.
  if (!proposalId) {
    return <Navigate to="/ProposalCentre" replace />;
  }

  const goToProposalCentre = () => navigate('/ProposalCentre');
  const goToRegeneration = () => navigate(`/ProposalCentre?regenerateFrom=${proposalId}`);
  const readableSections = sections.filter((s) => !!getSectionDef(s.section_type));
  const editorView = resolveProposalEditorState({
    loading,
    loadError,
    loadErrorDetail,
    proposal,
    sections,
    readableSections,
    timedOut: pollCount >= GENERATION_POLL_LIMIT,
  });

  if (editorView.state !== PROPOSAL_EDITOR_STATE.READY) {
    return (
      <ProposalEditorState
        title={editorView.title}
        message={editorView.message}
        reason={editorView.reason}
        showSpinner={editorView.showSpinner}
        actions={editorView.actions}
        onRetry={load}
        onRegenerate={goToRegeneration}
        onReturn={goToProposalCentre}
      />
    );
  }

  // A project this proposal points at that cannot be read is stated above the
  // document; the saved proposal content is still shown.
  const contextNotice = resolveProposalContextNotice({
    projectReadFailed: !!proposal?.project_id && !projectContext.projectName,
  });

  const visibleSections = readableSections.filter((s) => s.is_enabled !== false);
  const typeLabel = getProposalTypeLabel(proposal?.proposal_type);
  const hasUnsavedChanges = dirtySections.size > 0;

  return (
    <ProposalRenderBoundary onReturn={goToProposalCentre}>
    <div className="flex flex-col h-screen bg-[#F5F4F0] overflow-hidden">
      <ProposalWorkspaceToolbar
        title={proposal?.title || 'Proposal'}
        projectName={projectContext.projectName}
        typeLabel={typeLabel}
        showClientBrief={showClientBrief}
        onToggleClientBrief={() => setShowClientBrief((prev) => !prev)}
        showProperties={showProperties}
        onToggleProperties={() => setShowProperties((prev) => !prev)}
        exporting={exporting}
        onExport={handleExport}
        blockedReason={comparisonBlockReason || exportBlockedReason}
        error={exportError}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Section navigation ── */}
      <div className="w-56 border-r border-[#DCDBD6] bg-white flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[#DCDBD6]">
          <Link
            to="/ProposalCentre"
            className="flex items-center gap-1 text-xs text-[#625143] hover:text-[#213428] mb-2"
          >
            <ChevronLeft className="w-3 h-3" />
            Proposal Centre
          </Link>
          <div
            className="text-[10px] uppercase tracking-[0.16em] text-[#A79E8C] mt-2"
            style={{ fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Sections
          </div>
          <button
            onClick={() => setShowClientBrief(true)}
            className="text-xs text-[#625143] hover:text-[#213428] text-left mt-1"
          >
            {clientBrief ? `${clientBrief.slice(0, 28)}${clientBrief.length > 28 ? '…' : ''}` : 'No client brief'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ProposalSectionNav
            sections={sections}
            activeSectionKey={activeSectionKey}
            onSelect={setActiveSectionKey}
            onToggleVisibility={handleToggleVisibility}
            onReorder={handleReorder}
            readOnly={archived}
            proposalType={proposal?.proposal_type}
          />
        </div>
      </div>

      {/* ── Centre: The document ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Proposal typography scope — cover, section headings and body copy
            follow the Artcoustic rule: Futura PT Light headings, Didact Gothic
            body, Century Gothic fallback. */}
        <ProposalTypographyStyles />
        <div className="proposal-preview max-w-3xl mx-auto px-12 py-16">
          {contextNotice && (
            <div className="mb-4 text-xs text-[#7A6640] flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A79E8C] mt-1" />
              {contextNotice}
            </div>
          )}
          {archived && (
            <div className="mb-8 rounded-lg border border-[#A79E8C] bg-[#F5F4F0] px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#625143]" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                  <Archive className="w-4 h-4" />
                  Archived proposal — restore to edit.
                </div>
                <p className="text-xs text-[#8A8477] mt-1">This proposal is read-only. Restore it to make changes.</p>
              </div>
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
                style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          )}
          {editingSectionId && !archived ? (
            <div className="mb-4 text-xs text-[#213428] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#213428]" />
              Manual edit in progress — Save commits this section, Cancel restores the previous text.
            </div>
          ) : hasUnsavedChanges && !archived && (
            <div className="mb-4 text-xs text-amber-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Unsaved changes — {dirtySections.size} {dirtySections.size === 1 ? 'section' : 'sections'} pending. Do not close this tab until saved.
            </div>
          )}
          {visibleSections.map((section) => {
            const def = getSectionDef(section.section_type);
            if (!def) return null;
            const isActive = section.section_key === activeSectionKey;
            const editingThisSection = editingSectionId === section.id;

            return (
              <div
                key={section.id}
                className={`mb-12 ${isActive ? '' : 'opacity-60'}`}
                onClick={() => setActiveSectionKey(section.section_key)}
              >
                {def.type !== 'cover' && (
                  <div className="flex items-center gap-2 mb-4">
                    <h2
                      className="proposal-section-title text-[#1B1A1A]"
                      style={proposalRoleStyle('header')}
                    >
                      {resolveSectionTitle(section.section_type, section.title, proposal?.proposal_type)}
                    </h2>
                    {isManuallyEdited(section) && (
                      <span
                        className="px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#625143] bg-white border border-[#DCDBD6] rounded"
                        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                        title="The text of this section was edited by hand"
                      >
                        {MANUAL_EDIT_LABEL}
                      </span>
                    )}
                  </div>
                )}

                {isActive && def.canEditBody && section.section_type !== 'room_images' && !archived && (
                  <div className="mb-3">
                    <SectionToolbar
                      section={section}
                      onRegenerate={handleRegenerate}
                      onToggleLock={handleToggleLock}
                      onToggleNotes={() => setShowNotes(!showNotes)}
                      isRegenerating={regenerating === section.id}
                      isEditing={editingThisSection}
                      isManuallyEdited={isManuallyEdited(section)}
                      isSavingEdit={savingEdit}
                      onStartEdit={() => handleStartEdit(section)}
                      onSaveEdit={() => handleSaveEdit(section)}
                      onCancelEdit={() => handleCancelEdit(section)}
                    />
                  </div>
                )}

                {isActive && showNotes && def.canEditBody && !archived && (
                  <div className="mb-4">
                    <DealerNotesPanel
                      section={section}
                      onSave={handleSaveNotes}
                      onClose={() => setShowNotes(false)}
                    />
                  </div>
                )}

                {section.section_type === 'room_images' ? (
                  /* Project Images is imagery only: the uploaded project images,
                     never generated narrative. */
                  <div>
                    <ProjectImagesBlock images={packImages} />
                    <div
                      className="flex items-center justify-between gap-4 mt-3 text-[11px] text-[#625143]"
                      style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                    >
                      <span>
                        {projectGalleryImages(packImages).length > 0
                          ? `${projectGalleryImages(packImages).length} project image${projectGalleryImages(packImages).length === 1 ? '' : 's'} selected`
                          : 'No project images selected.'}
                      </span>
                      {proposal?.project_id && (
                        <a
                          href={`/ProjectProposalAssets?projectId=${proposal.project_id}`}
                          className="underline underline-offset-2 hover:text-[#213428]"
                        >
                          Manage project images
                        </a>
                      )}
                    </div>
                  </div>
                ) : def.canEditBody ? (
                  <InlineRichTextEditor
                    html={prepareSectionBody(section.body, {
                      title: section.title,
                      sectionType: section.section_type,
                      // The editor preview shows the same copy the PDF prints.
                      highChannel: isHighChannelDesign(proposal?.engineering_snapshot),
                    })}
                    // In manual edit mode nothing auto-saves: Save commits and
                    // Cancel discards. Outside it, the normal autosave applies.
                    onSave={editingThisSection ? undefined : (html, editedAt) => handleBodySave(section.id, html, editedAt)}
                    onDirty={
                      editingThisSection
                        ? (html) => handleEditDirty(section.id, html)
                        : (html, editedAt) => handleDirty(section.id, html, editedAt)
                    }
                    onUnloadSave={editingThisSection ? undefined : (html, editedAt) => handleUnloadSave(section.id, html, editedAt)}
                    editable={isActive && editingThisSection && !archived}
                    saveStatus={saveStatuses[section.id] || SAVE_STATUS.IDLE}
                  />
                ) : (
                  <div>
                    <div className="rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: '4/5' }}>
                      <ProposalCoverPage
                        projectName={projectContext.projectName || proposal?.title}
                        clientName={projectContext.clientName}
                        versionNames={proposalVersionNames}
                        reportTypeLabel={typeLabel}
                        dealerName={projectContext.dealerName}
                        projectReference={projectContext.projectReference}
                        coverImageUrl={projectContext.coverImageUrl}
                        heroImageUrl={projectContext.heroImageUrl}
                        logoUrl={projectContext.logoUrl}
                        generatedDate={proposal?.proposal_date || proposal?.created_date}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between gap-4 mt-2 text-[11px] text-[#625143]"
                      style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                    >
                      <span>
                        {projectContext.coverImageUrl
                          ? 'Using the project cover image'
                          : 'Using the default Sound Proof cover image'}
                      </span>
                      {proposal?.project_id && (
                        <a
                          href={`/ProjectProposalAssets?projectId=${proposal.project_id}`}
                          className="underline underline-offset-2 hover:text-[#213428]"
                        >
                          Change cover image
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {section.section_type === 'key_performance_highlights' && (comparisonBlocked
                  ? <ComparisonEvidenceState loading={recovery.status === 'loading'} />
                  : <KeyPerformanceHighlightsTable
                    rows={section.metadata?.highlight_rows}
                    comparisonRows={comparisonTableForDisplay.rows}
                    comparisonVersions={comparisonTableForDisplay.versions}
                    comparisonExpected={proposal?.proposal_type === 'comparison'}
                    proposalComparisonTable={comparisonTableForDisplay}
                    viewingResult={compactViewingResult(proposal?.engineering_snapshot)}
                    className="mt-4"
                  />
                )}

                {regenerating === section.id && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-[#625143]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Regenerating...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Client Brief & Narrative Focus ── */}
      {showClientBrief && (
        <div className="w-72 border-l border-[#DCDBD6] bg-white p-4 overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-sm font-semibold text-[#1B1A1A]"
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Client Brief &amp; Narrative Focus
            </h3>
            <button
              onClick={() => setShowClientBrief(false)}
              className="text-xs text-[#A79E8C] hover:text-[#625143]"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-[#625143] leading-relaxed mb-3">
            Describe anything you would like the report to emphasise. These notes guide the
            narrative only and never alter the engineering results.
          </p>
          <textarea
            value={clientBrief}
            readOnly={archived}
            onChange={(e) => setClientBrief(e.target.value)}
            placeholder="Example: Large screen, compact room with four seats, strong timbre matching, explain why the front row is the priority."
            rows={10}
            className="w-full p-3 text-xs text-[#1B1A1A] bg-[#F5F4F0] border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
            style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
          />
          {!archived && (
            <button
              onClick={handleSaveClientBrief}
              disabled={savingBrief}
              className="w-full mt-3 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
              style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
            >
              {savingBrief ? 'Saving…' : 'Save Brief'}
            </button>
          )}
          <div className="mt-4 p-2.5 bg-[#F5F4F0] border-l-2 border-[#213428] rounded-r">
            <p className="text-[10px] text-[#625143] leading-relaxed">
              <strong className="text-[#213428]">Note:</strong> Changing the Client Brief changes
              the wording and emphasis of the report. It must never change any engineering result,
              RP22 value, Design Rating, or recommendation. Use Refine to apply the brief to a
              section.
            </p>
          </div>
        </div>
      )}

      {/* ── Right: Contextual properties ── */}
      {showProperties && activeSection && (
        <div className="w-64 border-l border-[#DCDBD6] bg-white p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-[#3E4349] mb-3">Properties</h3>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-[#625143]">Section Type</div>
              <div className="text-[#1B1A1A]">{getSectionLabel(activeSection.section_type, proposal?.proposal_type)}</div>
            </div>
            <div>
              <div className="text-xs text-[#625143]">Status</div>
              <div className="text-[#1B1A1A]">
                {activeSection.locked ? '🔒 Locked' : 'Editable'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#625143]">Last Generated</div>
              <div className="text-[#1B1A1A] text-xs">
                {activeSection.last_gpt_generated_at
                  ? new Date(activeSection.last_gpt_generated_at).toLocaleString()
                  : 'Never'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#625143]">Last Edit</div>
              <div className="text-[#1B1A1A] text-xs">
                {activeSection.last_user_edited_at
                  ? new Date(activeSection.last_user_edited_at).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Print-only proposal document. Mounted for the lifetime of the editor
          so "Export Proposal PDF" prints without a render race; hidden on
          screen and revealed only while the export body class is active. */}
      <ProposalPrintDocument
        proposal={proposal}
        projectName={projectContext.projectName || proposal?.title}
        dealerName={projectContext.dealerName}
        projectReference={projectContext.projectReference}
        versionNames={proposalVersionNames}
        coverImageUrl={projectContext.coverImageUrl}
        heroImageUrl={projectContext.heroImageUrl}
        logoUrl={projectContext.logoUrl}
        sections={sections}
        projectImages={packImages}
        recoveredComparisonTable={comparisonTableForDisplay}
      />
      <ProposalPrintStyles />
    </div>
    </ProposalRenderBoundary>
  );
}