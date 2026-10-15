import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getSectionDef, getSectionLabel, resolveSectionTitle, getSectionsForProposalType } from '@/components/proposal/proposalSections';
import KeyPerformanceHighlightsTable from '@/components/proposal/KeyPerformanceHighlightsTable';
import { compactViewingResult } from '@/components/proposal/print/snapshotViewingRows';
import { getProposalTypeLabel } from '@/components/proposal/proposalTypes';
import useRecoveredComparisonTable from '@/components/proposal/useRecoveredComparisonTable';
import { resolveProposalComparison, isCompleteComparisonTable } from '@/components/proposal/comparisonDisplayAuthority';
import ComparisonEvidenceState from '@/components/proposal/ComparisonEvidenceState';
import InlineRichTextEditor from '@/components/proposal/InlineRichTextEditor';
import SectionToolbar from '@/components/proposal/SectionToolbar';
import DealerNotesPanel from '@/components/proposal/DealerNotesPanel';
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
import ProposalImagePlacement from '@/components/proposal/print/ProposalImagePlacement';
import SeatingStylePage from '@/components/proposal/print/SeatingStylePage';
import ComparisonPagesPreview from '@/components/proposal/editor/ComparisonPagesPreview';
import {
  composeSectionSlots,
  planProposalImages,
  resolveCoverAssetId,
} from '@/components/proposal/images/proposalImagePlanner';
import { EDITORIAL_ROLE } from '@/components/proposal/images/proposalImagePlacementAuthority';
import { prepareSectionBody } from '@/components/proposal/sectionBodyAuthority';
import { alternativesCarrier, orderPublicationSections } from '@/components/proposal/publicationOrder';
import { isHighChannelDesign } from '@/components/proposal/highChannelLayoutAuthority';
import ProposalPrintDocument from '@/components/proposal/export/ProposalPrintDocument';
import ProposalPrintStyles from '@/components/proposal/export/ProposalPrintStyles';
import { canMountPrintComposition, useProposalExport } from '@/components/proposal/export/useProposalExport';
import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import useProposalExportIdentity from '@/components/proposal/editor/useProposalExportIdentity';
import { documentTypeForProposalType } from '@/components/library/issuedDocument/issuedDocumentTypes';
import { resolveProposalExportSource } from '@/components/library/issuedDocument/proposalExportSource';
import { resolveCoverAsset, resolvePackImages } from '@/components/library/imageScopeAuthority';
import { buildVersionNameMap } from '@/components/library/libraryVersionLabels';
import { resolveReportFilenameDetails, logReportExportIdentity } from '@/components/report/reportFilenameIdentity';
import { proposalReportTypeToken } from '@/components/report/reportPdfTitle';
import { Loader2 } from 'lucide-react';
import ProposalEditorState from '@/components/proposal/editor/ProposalEditorState';
import ProposalRenderBoundary from '@/components/proposal/editor/ProposalRenderBoundary';
import ProposalGenerationPanel from '@/components/proposal/generation/ProposalGenerationPanel';
import ProposalReviewRequiredDialog from '@/components/proposal/editor/ProposalReviewRequiredDialog';
import ProposalSectionSidebar from '@/components/proposal/editor/ProposalSectionSidebar';
import ProposalEditorNotices from '@/components/proposal/editor/ProposalEditorNotices';
import ProposalClientBriefPanel from '@/components/proposal/editor/ProposalClientBriefPanel';
import useProposalReviewGate from '@/components/proposal/editor/useProposalReviewGate';
import ProposalApprovalRequiredDialog from '@/components/proposal/editor/ProposalApprovalRequiredDialog';
import useProposalApproval from '@/components/proposal/editor/useProposalApproval';
import { validatedOptionsCopy } from '@/components/proposal/options/validatedOptionsCopy';
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
  // Whether the generated copy layer blocks issue and export. Null when it does
  // not, and null for a proposal with no generated copy at all.
  const [editLayerBlockReason, setEditLayerBlockReason] = useState('Checking complete proposal…');
  const [documentLayer, setDocumentLayer] = useState(null);
  const optionsCopy = documentLayer?.proposal_id === proposal?.id ? validatedOptionsCopy(documentLayer) : '';
  // The approved options prose is printed once: on the Presented Options page
  // when that section is part of the document, otherwise as the lead of the
  // options image page itself.
  const currentDocumentLayer = documentLayer?.proposal_id === proposal?.id ? documentLayer : null;
  // ── Copy review — what still needs a human, from the document check ──
  // The server resolves it beside the copy layer (proposalReviewAuthority), so the
  // editor holds no second copy of the rule and the two statuses it shows — the
  // evidence check and the copy review — are read from one authority. The layer is
  // re-read after every saved section edit, so the count is never stale.
  const copyReview = currentDocumentLayer?.review || null;

  // ── Human approval of the generated copy ──
  // A separate answer from the evidence check, and deliberately so: a document can
  // pass every check and still not be fit to send, because nobody has read the
  // generated wording of each section. Which sections those are, and whether an
  // approval still matches the wording it was given for, is resolved on the server
  // (base44/shared/proposalApproval/sectionApprovalAuthority.js) — the editor reads
  // that state and renders it, and holds no rule of its own.
  const {
    approval,
    approvalByType,
    approvalBlockReason,
    approveSection: handleApproveSection,
    approvingSectionId,
    refreshSignal: layerRefreshSignal,
  } = useProposalApproval({ proposal, layer: currentDocumentLayer });
  // The publication assembly: the server's ordered, prepared sections. The local
  // fallback is ordered by the SAME authority, so the continuous Editor and the
  // printed PDF always read one document sequence.
  const documentSections = orderPublicationSections({
    sections: currentDocumentLayer?.document_validation?.document_sections
      || sections.filter(section => section.section_type !== 'presented_options'),
    proposalType: proposal?.proposal_type,
  });
  const optionsImageCopy = documentSections.some(
    (section) => section.section_type === 'presented_options'
      && section.is_enabled !== false
      && String(section.body || '').trim(),
  ) ? '' : optionsCopy;
  // How long the editor has waited for a generating proposal's sections.
  const [pollCount, setPollCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [saveStatuses, setSaveStatuses] = useState({});
  const [dirtySections, setDirtySections] = useState(new Set());
  const [regenerating, setRegenerating] = useState(null);
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
        // The document's own order authority: the report type's section
        // definitions decide the sequence, never the order the rows arrived in.
        const ordered = orderPublicationSections({
          sections: (sectionResults || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
          proposalType: proposalRecord.proposal_type,
        });
        setSections(ordered);
        if (ordered.length > 0 && !activeSectionKey) {
          // Open on the first section the editor can actually show.
          const firstReadable = ordered.find((s) => getSectionDef(s.section_type));
          setActiveSectionKey((firstReadable || ordered[0]).section_key);
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

  // The saved version names and the export identity, resolved here so the export
  // can wait for them rather than printing a document whose names are still
  // arriving (see useProposalExportIdentity).
  const {
    versionNameById,
    versionNames: proposalVersionNames,
    resolveExportIdentity,
  } = useProposalExportIdentity({ proposal, projectContext });

  // The images this document composes with: the versions it covers first, then
  // the project-wide gallery for anything they leave free.
  const packImages = useMemo(() => resolvePackImages({
    assets: projectContext.projectImages,
    versionIds: proposalVersionIds(proposal),
    versionNameById,
  }), [projectContext.projectImages, proposal?.selected_version_ids, proposal?.version_id, versionNameById]);

  // The same editorial image plan the printed pack composes, so the preview and
  // the PDF place the same image on the same page in the same crop. The preview
  // never re-plans, so it cannot disagree with the document that prints.
  const imagePlan = useMemo(() => planProposalImages({
    assets: packImages,
    sectionSlots: composeSectionSlots({
      sections,
      sectionTypes: getSectionsForProposalType(proposal?.proposal_type).map((def) => def.type),
    }),
    coverAssetId: resolveCoverAssetId({
      assets: packImages,
      coverImageUrl: projectContext.coverImageUrl,
    }),
  }), [packImages, sections, proposal?.proposal_type, projectContext.coverImageUrl]);

  // The sections this document actually shows: a section with no definition is
  // never rendered, and a section the designer switched off is not previewed.
  // Both are initialized HERE — before the comparison anchoring below reads
  // them — so no consumer can ever reach them first.
  const readableSections = documentSections.filter((s) => !!getSectionDef(s.section_type));
  const visibleSections = readableSections.filter((s) => s.is_enabled !== false);

  // The comparison group pages the plan composed: previewed from the same plan
  // the printed pack composes, so the preview and the PDF show the same page.
  const comparisonPreviewGroups = (imagePlan.comparisonPages || []).filter(group => group.placements?.length >= 2);

  // ── ONE carrier for the document's alternatives ──────────────────────────
  // Whether the designer grouped them as seating styles or as a comparison set,
  // the alternatives and the validated Presented Options prose that explains them
  // are previewed TOGETHER, on the section that carries that prose — exactly as
  // the printed pack composes them. Images shown in one place and their
  // explanation two sections later is not a client presentation, and the
  // explanation is never shown twice.
  const seatingPlacements = imagePlan.seatingPlacements;
  const alternativesForOptions = alternativesCarrier({
    alternativeGroups: (seatingPlacements.length >= 2 ? 1 : 0) + comparisonPreviewGroups.length,
    sectionTypes: visibleSections.map((section) => section.section_type),
    anchorType: imagePlan.seatingPageAnchorType,
  }) === 'presented_options';
  const seatingGroupedWithOptions = alternativesForOptions && seatingPlacements.length >= 2;
  const comparisonGroupedWithOptions = alternativesForOptions && comparisonPreviewGroups.length > 0;
  const seatingCarrierType = seatingGroupedWithOptions ? 'presented_options' : imagePlan.seatingPageAnchorType;
  // Where a comparison group is previewed when the Presented Options section does
  // not carry it: immediately before its anchor, or at the end of the narrative
  // when that anchor is not part of the document.
  const comparisonPreviewAtAnchor = !comparisonGroupedWithOptions && comparisonPreviewGroups.length > 0
    && !!imagePlan.seatingPageAnchorType
    && visibleSections.some((section) => section.section_type === imagePlan.seatingPageAnchorType);
  const comparisonPreviewTrailing = comparisonPreviewGroups.length > 0
    && !comparisonGroupedWithOptions && !comparisonPreviewAtAnchor;

  // ── Export — full proposal PDF ──
  // Exports the whole proposal (every enabled section). Section-level export is
  // not implemented, so it is deliberately not exposed.
  const {
    exporting,
    // The read-only preview of the exact print document.
    previewing,
    error: exportError,
    blockedReason: exportBlockedReason,
    retryable: exportRetryable,
    // The technical record of a pagination stop, for a master-admin login only.
    errorDetail: exportErrorDetail,
    handleExport,
    handlePreview,
  } = useProposalExport({
    proposal,
    sections: documentSections,
    // Composition availability: what must be in hand before ANY document is
    // composed, preview included — the comparison evidence and the proposal's own
    // copy. It withholds both actions.
    comparisonBlockReason,
    // The copy layer's own editorial block, which is an ISSUE gate: it withholds
    // the issued document and never the read-only preview of it.
    issueBlockReason: editLayerBlockReason,
    // The approval rule, as an issue gate of its own: no PDF is created before
    // every generated section has been read and approved. It withholds the issued
    // export only — previewing the document while it is under review is what the
    // preview is for — and the export click is routed to the approval dialog
    // before it ever reaches here.
    approvalBlockReason,
    projectName: projectContext.projectName,
    dealerName: projectContext.filenameDealerName,
    clientName: projectContext.filenameClientName,
    projectReference: projectContext.projectReference,
    // The exact saved version names this document was built from.
    versionNames: proposalVersionNames,
    // The document's own inputs, resolved before anything is prepared: the export
    // waits for a late-resolving saved version name rather than printing without it.
    resolveExportIdentity,
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

  // ── The export click — a review block is never silent ──
  // While copy is awaiting approval the issue gate holds the issued document back,
  // so the click states the rule, names the sections that still need approval and
  // offers the way to the first one. Every other block — missing evidence, a
  // comparison still being read, a real print failure — goes straight to the
  // export, which reports its own reason, so a genuine failure is never hidden
  // behind the review.
  const {
    showDialog: showReviewDialog,
    showApprovalDialog,
    requestExport: handleExportClick,
    reviewFirstSection: handleReviewCopy,
    reviewNextApproval,
    dismiss: dismissReviewDialog,
    dismissApproval: dismissApprovalDialog,
  } = useProposalReviewGate({
    review: copyReview,
    // The approval rule is asked first: a document whose generated sections have
    // not all been approved is not issuable, and the way forward is to read the
    // next one rather than to argue with the evidence check.
    approval,
    sections,
    onExport: handleExport,
    setActiveSectionKey,
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

  const typeLabel = getProposalTypeLabel(proposal?.proposal_type);

  return (
    <ProposalRenderBoundary onReturn={goToProposalCentre}>
    <div className="flex flex-col h-screen bg-[#F5F4F0] overflow-hidden">
      <ProposalWorkspaceToolbar
        title={proposal?.title || 'Proposal'}
        projectName={projectContext.projectName}
        typeLabel={typeLabel}
        showClientBrief={showClientBrief}
        onToggleClientBrief={() => setShowClientBrief((prev) => !prev)}
        exporting={exporting}
        onExport={handleExportClick}
        previewing={previewing}
        onPreview={handlePreview}
        blockedReason={comparisonBlockReason || exportBlockedReason || (copyReview ? null : editLayerBlockReason)}
        review={copyReview}
        approval={approval}
        error={exportError}
        retryable={exportRetryable}
        errorDetail={exportErrorDetail}
      />

      <ProposalReviewRequiredDialog
        open={showReviewDialog}
        review={copyReview}
        onReviewCopy={handleReviewCopy}
        onCancel={dismissReviewDialog}
      />

      {/* The approval rule, stated on the click that tried to issue the document */}
      <ProposalApprovalRequiredDialog
        open={showApprovalDialog}
        approval={approval}
        onReviewNext={reviewNextApproval}
        onCancel={dismissApprovalDialog}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Section navigation ── */}
      <ProposalSectionSidebar
        clientBrief={clientBrief}
        onShowClientBrief={() => setShowClientBrief(true)}
        sections={sections}
        activeSectionKey={activeSectionKey}
        onSelect={setActiveSectionKey}
        onToggleVisibility={handleToggleVisibility}
        onReorder={handleReorder}
        readOnly={archived}
        proposalType={proposal?.proposal_type}
        approvalByType={approvalByType}
      />

      {/* ── Centre: The document ── */}
      <div className="flex-1 overflow-y-auto">
        {/* The generated copy: its status, the wording an editor may change and the
            copy as the client reads it. The generation's own diagnostics are not
            part of this workspace — they live in the administrative diagnostics
            view, which is the only surface the server sends the audit block to. A
            proposal with no generation history is stated as legacy and is never
            blocked. */}
        <ProposalGenerationPanel
          proposal={proposal}
          readOnly={archived}
          onBlockedReasonChange={setEditLayerBlockReason}
          onLayerChange={setDocumentLayer}
          documentRevision={JSON.stringify(sections.map(section => [section.id, section.body, section.is_enabled, section.order_index, section.dealer_notes]))}
          refreshSignal={layerRefreshSignal}
        />
        {/* Proposal typography scope — cover, section headings and body copy
            follow the Artcoustic rule: Futura PT Light headings, Didact Gothic
            body, Century Gothic fallback. */}
        <ProposalTypographyStyles />
        <div className="proposal-preview max-w-3xl mx-auto px-12 py-16">
          <ProposalEditorNotices
            contextNotice={contextNotice}
            archived={archived}
            restoring={restoring}
            onRestore={handleRestore}
            manualEditInProgress={Boolean(editingSectionId)}
            unsavedSectionCount={dirtySections.size}
          />
          {visibleSections.map((section) => {
            const def = getSectionDef(section.section_type);
            if (!def) return null;
            const isActive = section.section_key === activeSectionKey;
            const editingThisSection = editingSectionId === section.id;

            // The images this section carries, from the one plan the whole
            // document was composed with: a landscape feature leads the page, a
            // portrait accent sits smaller beside the copy it illustrates.
            const media = imagePlan.bySection[section.id] || [];
            const landscapePlacement = media.find((placement) => placement.editorial_role === EDITORIAL_ROLE.LANDSCAPE_FEATURE
              || placement.editorial_role === EDITORIAL_ROLE.CLOSING_FEATURE) || null;
            const portraitPlacement = media.find((placement) => placement.editorial_role === EDITORIAL_ROLE.PORTRAIT_EDITORIAL) || null;

            const bodyEditor = (
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
            );

            // The seating-style page is not a stored section: it is previewed
            // where it prints, immediately before the closing section.
            const showSeatingPreview = seatingPlacements.length >= 2
              && section.section_type === seatingCarrierType;

            return (
              <React.Fragment key={section.id}>
                {showSeatingPreview && !seatingGroupedWithOptions && (
                  <div className="mb-12 border-t border-dashed border-[#DCDBD6] pt-8">
                    <h2
                      className="proposal-section-title text-[#1B1A1A] mb-4"
                      style={proposalRoleStyle('header')}
                    >
                      Seating Style
                    </h2>
                    <div className="rounded-xl overflow-hidden border border-[#DCDBD6] p-6">
                      <SeatingStylePage placements={seatingPlacements} showHeader={false} validatedCopy={optionsImageCopy} />
                    </div>
                  </div>
                )}

                {/* Each comparison group's own page, previewed where it prints:
                    the designer's message, the options full width, in order. */}
                {comparisonPreviewAtAnchor && section.section_type === imagePlan.seatingPageAnchorType && (
                  <ComparisonPagesPreview
                    groups={comparisonPreviewGroups}
                    validatedCopy={optionsImageCopy}
                    roleStyle={proposalRoleStyle}
                  />
                )}
              <div
                className={`mb-12 ${isActive ? '' : 'opacity-60'}`}
                data-proposal-section={section.section_type}
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
                      // The approval of THIS section's generated wording, and the
                      // one action that gives it. Null for a section that carries
                      // nothing to approve.
                      approvalStatus={approvalByType?.[section.section_type] || null}
                      isApproving={approvingSectionId === section.id}
                      onApprove={() => handleApproveSection(section)}
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
                     never generated narrative. A dedicated spread is kept only
                     when genuinely unused strong images remain — otherwise the
                     images already carry the document editorially, and repeating
                     them here would be the gallery-first layout being replaced. */
                  <div>
                    {imagePlan.retainedGallery ? (
                      <ProjectImagesBlock images={imagePlan.galleryImages} />
                    ) : (
                      <p className="text-sm text-[#625143]" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                        {imagePlan.usableCount > 0
                          ? `Images are placed editorially through this document — ${imagePlan.placements.length} placement${imagePlan.placements.length === 1 ? '' : 's'} from ${imagePlan.usableCount} source image${imagePlan.usableCount === 1 ? '' : 's'}.`
                          : 'No project images selected.'}
                      </p>
                    )}
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
                  <div>
                    {/* The dominant treatment leads the page, exactly as the
                        printed pack composes it. */}
                    {landscapePlacement ? (
                      <ProposalImagePlacement placement={landscapePlacement} className="mb-4" />
                    ) : null}
                    {/* The portrait accent sits beside the copy, not above it. */}
                    {portraitPlacement ? (
                      <div className="pp-media-row">
                        <div className="pp-media-row__copy">{bodyEditor}</div>
                        <ProposalImagePlacement placement={portraitPlacement} />
                      </div>
                    ) : bodyEditor}
                  </div>
                ) : (
                  <div>
                    <div className="rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: '4/5' }}>
                      <ProposalCoverPage
                        projectName={projectContext.projectName || proposal?.title}
                        clientName={projectContext.clientName}
                        versionNames={proposalVersionNames}
                        proposalType={proposal?.proposal_type}
                        reportTypeLabel={typeLabel}
                        dealerName={projectContext.dealerName}
                        projectReference={projectContext.projectReference}
                        coverImageUrl={projectContext.coverImageUrl}
                        heroImageUrl={projectContext.heroImageUrl}
                        focalPoint={imagePlan.coverPlacement?.focal_point || null}
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

                {/* The seating images of the validated Presented Options section:
                    they belong to the copy that explains them, so they are
                    presented with it, once, each keeping its own caption. */}
                {seatingGroupedWithOptions && section.section_type === 'presented_options' && (
                  <div className="mt-6 rounded-xl overflow-hidden border border-[#DCDBD6] p-6">
                    <SeatingStylePage placements={seatingPlacements} showHeader={false} showCopy={false} />
                  </div>
                )}

                {/* The alternatives the designer marked as comparison options are
                    shown on the same section, under the validated copy that
                    explains them — the same grouping the PDF composes. Each
                    option keeps its own label; the explanation is not repeated. */}
                {comparisonGroupedWithOptions && section.section_type === 'presented_options' && (
                  <div className="mt-6">
                    <ComparisonPagesPreview
                      groups={comparisonPreviewGroups}
                      validatedCopy=""
                      roleStyle={proposalRoleStyle}
                    />
                  </div>
                )}

                {regenerating === section.id && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-[#625143]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Regenerating...
                  </div>
                )}
              </div>
              </React.Fragment>
            );
          })}

          {/* A comparison page whose anchor section was not composed still
              belongs in the document, exactly where the printed pack places it. */}
          {comparisonPreviewTrailing && (
            <ComparisonPagesPreview groups={comparisonPreviewGroups} roleStyle={proposalRoleStyle} validatedCopy={optionsImageCopy} />
          )}
        </div>
      </div>

      {/* ── Right: Client Brief & Narrative Focus ── */}
      {showClientBrief && (
        <ProposalClientBriefPanel
          clientBrief={clientBrief}
          readOnly={archived}
          onChange={setClientBrief}
          onSave={handleSaveClientBrief}
          saving={savingBrief}
          onClose={() => setShowClientBrief(false)}
        />
      )}

      </div>

      {/* The print-only document is mounted as soon as its own source data is
          available, for BOTH actions: the A4 pack is the document the designer
          inspects and the document that is issued. Withholding it until the copy
          passed its issue gate is what made a read-only preview impossible — the
          gate is applied to the EXPORT, on the server, before anything is printed.
          The application interface is never printed in its place. */}
      {canMountPrintComposition({ proposal, sections: documentSections }) && <ProposalPrintDocument
        proposal={proposal}
        projectName={projectContext.projectName || proposal?.title}
        dealerName={projectContext.dealerName}
        projectReference={projectContext.projectReference}
        versionNames={proposalVersionNames}
        coverImageUrl={projectContext.coverImageUrl}
        heroImageUrl={projectContext.heroImageUrl}
        logoUrl={projectContext.logoUrl}
        sections={documentSections}
        validatedOptionsCopy={optionsImageCopy}
        projectImages={packImages}
        recoveredComparisonTable={comparisonTableForDisplay}
      />}
      <ProposalPrintStyles />
    </div>
    </ProposalRenderBoundary>
  );
}