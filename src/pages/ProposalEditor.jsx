import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { NARRATIVE_GOALS, getSectionDef } from '@/components/proposal/proposalSections';
import { getProposalType } from '@/components/proposal/proposalTypes';
import InlineRichTextEditor from '@/components/proposal/InlineRichTextEditor';
import SectionToolbar from '@/components/proposal/SectionToolbar';
import DealerNotesPanel from '@/components/proposal/DealerNotesPanel';
import ProposalSectionNav from '@/components/proposal/ProposalSectionNav';
import { Loader2, FileText, Download, ChevronLeft, Presentation } from 'lucide-react';

const SAVE_STATUS = { IDLE: 'idle', SAVING: 'saving', SAVED: 'saved' };

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
  const [regenerating, setRegenerating] = useState(null);
  const [showProperties, setShowProperties] = useState(false);

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
  const saveTimers = useRef({});
  const handleBodySave = useCallback((sectionId, html) => {
    setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.SAVING }));
    if (saveTimers.current[sectionId]) clearTimeout(saveTimers.current[sectionId]);
    saveTimers.current[sectionId] = setTimeout(async () => {
      try {
        await base44.entities.ProposalSection.update(sectionId, {
          body: html,
          last_user_edited_at: new Date().toISOString(),
        });
        setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.SAVED }));
        setTimeout(() => {
          setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.IDLE }));
        }, 2000);
      } catch (err) {
        console.error('Save failed:', err);
        setSaveStatuses((prev) => ({ ...prev, [sectionId]: SAVE_STATUS.IDLE }));
      }
    }, 500);
  }, []);

  // ── Section handlers ──
  const activeSection = sections.find((s) => s.section_key === activeSectionKey);

  const handleToggleLock = async () => {
    if (!activeSection) return;
    const updated = { ...activeSection, locked: !activeSection.locked };
    setSections((prev) => prev.map((s) => (s.id === activeSection.id ? updated : s)));
    await base44.entities.ProposalSection.update(activeSection.id, { locked: updated.locked });
  };

  const handleToggleVisibility = async (sectionId) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const updated = { ...section, is_enabled: !section.is_enabled };
    setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
    await base44.entities.ProposalSection.update(sectionId, { is_enabled: updated.is_enabled });
  };

  const handleReorder = async (reorderedSections) => {
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
    if (!activeSection) return;
    setSections((prev) =>
      prev.map((s) => (s.id === activeSection.id ? { ...s, dealer_notes: notes } : s))
    );
    await base44.entities.ProposalSection.update(activeSection.id, { dealer_notes: notes });
  };

  // ── Regeneration (placeholder — GPT integration in Stage 5) ──
  const handleRegenerate = async (action) => {
    if (!activeSection) return;
    if (activeSection.locked) {
      const confirmed = window.confirm(
        'This section is locked. Regeneration will replace your manual edits. Continue?'
      );
      if (!confirmed) return;
    }
    setRegenerating(activeSection.id);
    setTimeout(() => {
      setRegenerating(null);
      alert('GPT regeneration will be available in Stage 5. The editor is ready for it.');
    }, 1000);
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
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F5F4F0] text-center px-6">
        <Presentation className="w-10 h-10 text-[#625143] mb-4" />
        <h2
          className="text-lg font-bold text-[#1B1A1A] mb-2"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          No Proposal Selected
        </h2>
        <p className="text-sm text-[#625143] mb-6">
          Proposals are created from the Proposal Centre. Open it to start a new proposal.
        </p>
        <Link
          to="/ProposalCentre"
          className="px-5 py-2.5 text-sm rounded-md text-white"
          style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Go to Proposal Centre
        </Link>
      </div>
    );
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
        <p className="text-sm text-[#625143] mt-2">GPT is writing your complete proposal.</p>
      </div>
    );
  }

  const visibleSections = sections.filter((s) => s.is_enabled !== false);
  const typeLabel = getProposalType(proposal?.proposal_type)?.label || 'Single Design Proposal';

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
          <div className="text-xs text-[#625143]">
            {NARRATIVE_GOALS.find((g) => g.value === proposal?.narrative_goal)?.label || 'Luxury Cinema'}
          </div>
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

                {isActive && def.canEditBody && (
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

                {isActive && showNotes && def.canEditBody && (
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
                    editable={isActive}
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
              <div className="text-xs text-[#625143]">Last GPT</div>
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