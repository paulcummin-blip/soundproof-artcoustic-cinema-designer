import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getSectionDef } from '@/components/proposal/proposalSections';
import { getProposalType } from '@/components/proposal/proposalTypes';
import InlineRichTextEditor from '@/components/proposal/InlineRichTextEditor';
import SectionToolbar from '@/components/proposal/SectionToolbar';
import DealerNotesPanel from '@/components/proposal/DealerNotesPanel';
import ProposalSectionNav from '@/components/proposal/ProposalSectionNav';
import { isArchived, getRestoreStatus } from '@/components/proposal/proposalLifecycle';
import { appParams } from '@/lib/app-params';
import { Loader2, FileText, Download, ChevronLeft, Archive, RotateCcw } from 'lucide-react';

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

  const [proposal, setProposal] = useState(null);
  const [sections, setSections] = useState([]);
  const [activeSectionKey, setActiveSectionKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [saveStatuses, setSaveStatuses] = useState({});
  const [dirtySections, setDirtySections] = useState(new Set());
  const [regenerating, setRegenerating] = useState(null);
  const [showProperties, setShowProperties] = useState(false);
  const [clientBrief, setClientBrief] = useState('');
  const [showClientBrief, setShowClientBrief] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [restoring, setRestoring] = useState(false);

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
      if (proposalRecord) {
        setClientBrief(proposalRecord.client_brief || '');
        const sectionResults = await base44.entities.ProposalSection.filter({
          proposal_id: proposalRecord.id,
        });
        const sorted = (sectionResults || []).sort(
          (a, b) => (a.order_index || 0) - (b.order_index || 0)
        );
        setSections(sorted);
        if (sorted.length > 0 && !activeSectionKey) {
          setActiveSectionKey(sorted[0].section_key);
        }
      }
    } catch (err) {
      console.error('Failed to load proposal:', err);
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Auto-save section body ──
  // Tracks dirty sections, flushes pending saves on unmount, and transitions
  // Generated → Edited after the first successful manual section save.
  const saveTimers = useRef({});
  const pendingSavesRef = useRef({}); // sectionId -> { html, promise }
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;
  const dirtySectionsRef = useRef(new Set());
  const archivedRef = useRef(false);
  archivedRef.current = isArchived(proposal?.status);

  const transitionToEdited = useCallback(async () => {
    const current = proposalRef.current;
    if (!current) return;
    const rawStatus = current.status;
    // Only transition from 'generated' (or legacy 'reviewed' normalised to 'edited')
    if (rawStatus !== 'generated') return;
    try {
      const response = await base44.functions.invoke('transitionProposalStatus', {
        proposal_id: current.id,
        target_status: 'edited',
      });
      if (response?.data?.error) {
        console.error('[ProposalEditor] Generated→Edited transition rejected:', response.data.error);
        return;
      }
      setProposal((prev) => prev ? { ...prev, status: 'edited' } : prev);
    } catch (err) {
      console.error('[ProposalEditor] Generated→Edited transition failed:', err);
    }
  }, []);

  // Mark a section dirty immediately on user input (before debounce fires).
  const handleDirty = useCallback((sectionId) => {
    if (archivedRef.current) return;
    setDirtySections((prev) => {
      if (prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.add(sectionId);
      dirtySectionsRef.current = next;
      return next;
    });
    setSaveStatuses((prev) => {
      if (prev[sectionId] === SAVE_STATUS.SAVING) return prev;
      return { ...prev, [sectionId]: SAVE_STATUS.UNSAVED };
    });
  }, []);

  // Keepalive flush — survives page teardown. Used on unmount when edits are unsaved.
  const handleUnloadSave = useCallback((sectionId, html) => {
    if (archivedRef.current) return;
    const token = appParams.token;
    if (!token || !sectionId) return;
    const url = `${appParams.serverUrl}/api/apps/${appParams.appId}/entities/ProposalSection/${sectionId}`;
    try {
      fetch(url, {
        method: 'PUT',
        keepalive: true,
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-App-Id': String(appParams.appId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: html,
          last_user_edited_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch (e) {
      // Swallow — best-effort during teardown
    }
  }, []);

  const flushSave = useCallback(async (sectionId) => {
    const timer = saveTimers.current[sectionId];
    if (timer) {
      clearTimeout(timer);
      delete saveTimers.current[sectionId];
    }
    const pending = pendingSavesRef.current[sectionId];
    if (!pending) return;
    delete pendingSavesRef.current[sectionId];
    try {
      await pending.promise;
    } catch (e) {
      // Error already handled in the save function; swallow here.
    }
  }, []);

  const handleBodySave = useCallback((sectionId, html) => {
    // Mark dirty immediately — the edit is not yet persisted.
    setDirtySections((prev) => new Set(prev).add(sectionId));
    setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.SAVING }));
    if (saveTimers.current[sectionId]) clearTimeout(saveTimers.current[sectionId]);

    const savePromise = (async () => {
      try {
        await base44.entities.ProposalSection.update(sectionId, {
          body: html,
          last_user_edited_at: new Date().toISOString(),
        });
        setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.SAVED }));
        setDirtySections((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          dirtySectionsRef.current = next;
          return next;
        });
        setTimeout(() => {
          setSaveStatuses((prev) => {
            const current = prev[sectionId];
            if (current === SAVE_STATUS.SAVED) {
              const next = { ...prev };
              delete next[sectionId];
              return next;
            }
            return prev;
          });
        }, 2000);
        // Transition Generated → Edited after the first successful save.
        await transitionToEdited();
      } catch (err) {
        console.error('Save failed:', err);
        setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.FAILED }));
        // Keep the section marked dirty — the edit was not persisted.
      }
    })();

    pendingSavesRef.current[sectionId] = { html, promise: savePromise };
    saveTimers.current[sectionId] = setTimeout(() => {
      // The savePromise is already running — just clear the timer ref.
      delete saveTimers.current[sectionId];
    }, 500);
  }, [transitionToEdited]);

  // Flush all pending saves on unmount and warn before navigating away with unsaved changes.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const hasPending = Object.keys(pendingSavesRef.current).length > 0 || dirtySectionsRef.current.size > 0;
      if (hasPending) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Keepalive-flush saves still in-flight (SDK fetch may be aborted during teardown).
      Object.entries(pendingSavesRef.current).forEach(([sid, pending]) => {
        if (pending?.html) handleUnloadSave(sid, pending.html);
      });
      Object.values(saveTimers.current).forEach((t) => clearTimeout(t));
      saveTimers.current = {};
    };
  }, [handleUnloadSave]);

  // ── Section handlers ──
  const activeSection = sections.find((s) => s.section_key === activeSectionKey);

  const handleToggleLock = async () => {
    if (!activeSection || archived) return;
    const updated = { ...activeSection, locked: !activeSection.locked };
    setSections((prev) => prev.map((s) => (s.id === activeSection.id ? updated : s)));
    await base44.entities.ProposalSection.update(activeSection.id, { locked: updated.locked });
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
    if (activeSection.locked) {
      const confirmed = window.confirm(
        'This section is locked. Regeneration will replace your manual edits. Continue?'
      );
      if (!confirmed) return;
    }
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

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F5F4F0]">
        <Loader2 className="w-6 h-6 text-[#625143] animate-spin" />
      </div>
    );
  }

  if (!proposalId) {
    return <Navigate to="/ProposalCentre" replace />;
  }

  if (proposal?.status === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F5F4F0]">
        <Loader2 className="w-8 h-8 text-[#213428] animate-spin mb-4" />
        <h3
          className="text-lg font-bold text-[#1B1A1A]"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Generating Proposal
        </h3>
        <p className="text-sm text-[#625143] mt-2">Sound Proof is generating your complete proposal.</p>
      </div>
    );
  }

  const visibleSections = sections.filter((s) => s.is_enabled !== false);
  const typeLabel = getProposalType(proposal?.proposal_type)?.label || 'Single Design Proposal';
  const hasUnsavedChanges = dirtySections.size > 0;

  return (
    <div className="flex h-screen bg-[#F5F4F0] overflow-hidden">
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
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#213428]" />
            <span
              className="text-sm font-bold text-[#1B1A1A]"
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              {proposal?.title || 'Proposal'}
            </span>
          </div>
          <div className="text-xs text-[#625143] mt-1">{typeLabel}</div>
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
          />
        </div>
      </div>

      {/* ── Centre: The document ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-12 py-16">
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
          {hasUnsavedChanges && !archived && (
            <div className="mb-4 text-xs text-amber-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Unsaved changes — {dirtySections.size} {dirtySections.size === 1 ? 'section' : 'sections'} pending. Do not close this tab until saved.
            </div>
          )}
          {visibleSections.map((section) => {
            const def = getSectionDef(section.section_type);
            if (!def) return null;
            const isActive = section.section_key === activeSectionKey;

            return (
              <div
                key={section.id}
                className={`mb-12 ${isActive ? '' : 'opacity-60'}`}
                onClick={() => setActiveSectionKey(section.section_key)}
              >
                {def.type !== 'cover' && (
                  <h2
                    className="text-2xl font-bold text-[#1B1A1A] mb-4"
                    style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                  >
                    {section.title}
                  </h2>
                )}

                {isActive && def.canEditBody && !archived && (
                  <div className="mb-3">
                    <SectionToolbar
                      section={section}
                      onRegenerate={handleRegenerate}
                      onToggleLock={handleToggleLock}
                      onToggleNotes={() => setShowNotes(!showNotes)}
                      isRegenerating={regenerating === section.id}
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

                {def.canEditBody ? (
                  <InlineRichTextEditor
                    html={section.body}
                    onSave={(html) => handleBodySave(section.id, html)}
                    onDirty={() => handleDirty(section.id)}
                    onUnloadSave={(html) => handleUnloadSave(section.id, html)}
                    editable={isActive && !archived}
                    saveStatus={saveStatuses[section.id] || SAVE_STATUS.IDLE}
                  />
                ) : (
                  <div className="rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: '4/5' }}>
                    <CoverSection proposal={proposal} />
                  </div>
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
            onChange={(e) => setClientBrief(e.target.value)}
            placeholder="e.g. The client is passionate about music and wants invisible loudspeakers…"
            rows={10}
            className="w-full p-3 text-xs text-[#1B1A1A] bg-[#F5F4F0] border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
            style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
          />
          <button
            onClick={handleSaveClientBrief}
            disabled={savingBrief}
            className="w-full mt-3 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            {savingBrief ? 'Saving…' : 'Save Brief'}
          </button>
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
              <div className="text-[#1B1A1A]">{getSectionDef(activeSection.section_type)?.label}</div>
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

      {/* ── Top bar ── */}
      <div className="fixed top-0 right-0 z-40 flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => setShowClientBrief(!showClientBrief)}
          className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
            showClientBrief
              ? 'bg-[#213428] text-white border-[#213428]'
              : 'border-[#DCDBD6] bg-white text-[#3E4349] hover:bg-[#F5F4F0]'
          }`}
        >
          Client Brief
        </button>
        <button
          onClick={() => setShowProperties(!showProperties)}
          className="px-3 py-1.5 text-xs rounded-md border border-[#DCDBD6] bg-white text-[#3E4349] hover:bg-[#F5F4F0]"
        >
          {showProperties ? 'Hide' : 'Show'} Properties
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-white"
          style={{ backgroundColor: '#213428' }}
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>
    </div>
  );
}

// ── Cover section component ──
function CoverSection({ proposal }) {
  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#213428' }}>
      <div className="p-8 flex items-center" style={{ minHeight: 56 }}>
        <span
          className="text-sm font-bold text-white"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Dealer Logo
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-xs uppercase tracking-[0.25em] text-[#625143] mb-3">
          Cinema Design Proposal
        </div>
        <div
          className="text-3xl font-bold text-white"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          {proposal?.title || 'Project Name'}
        </div>
      </div>
      <div className="px-8 py-3 flex items-center justify-between" style={{ backgroundColor: '#3E4349' }}>
        <span className="text-xs text-white/80">Dealer Name</span>
        <span className="text-[10px] text-white/50 uppercase tracking-wider">
          Powered by Sound Proof
        </span>
      </div>
    </div>
  );
}