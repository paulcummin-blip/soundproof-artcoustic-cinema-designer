import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import BrandAssetsPanel from '@/components/proposal/BrandAssetsPanel';
import CreateProposalWizard from '@/components/proposal/CreateProposalWizard';
import useProposalEntryContext from '@/components/proposal/wizard/useProposalEntryContext';
import { useActiveProjectId } from '@/components/state/project-session';
import ProposalLibraryTab from '@/components/proposal/library/ProposalLibraryTab';
import { Plus, ChevronLeft } from 'lucide-react';

// The Proposal Centre's navigation: find and manage proposals, then the brand
// assets they are published with. Create Proposal is the header action.
const TABS = [
  { key: 'library', label: 'Proposal Library' },
  { key: 'brand', label: 'Brand Assets' },
];

const DEFAULT_TAB = 'library';
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

/**
 * A tab that is no longer offered — Templates, Product Intelligence, or anything
 * else an old link or a saved tab state may still ask for — resolves to the
 * Proposal Library, so a stale request never lands on an empty page.
 */
const normaliseTab = (value) => (TAB_KEYS.has(value) ? value : DEFAULT_TAB);

import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function ProposalCentre() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => normaliseTab(searchParams.get('tab')));

  // The entry context decides which project the wizard opens for. An explicit
  // Cinema Designer link (create=1 with projectId/versionId) wins; a sidebar
  // entry (no URL parameters) resolves to the active workspace project; an
  // "Open Client Proposal" link (versionId without create) opens the library.
  const urlProjectId = searchParams.get('projectId');
  const urlVersionId = searchParams.get('versionId');
  const isCreateEntry = searchParams.get('create') === '1';
  const isSidebarEntry = !isCreateEntry && !urlProjectId && !urlVersionId;

  const activeProjectId = useActiveProjectId();
  // The project the wizard opens for: the URL project, then the active workspace
  // project, then nothing. A stale session draft never supplies a project of its
  // own, so it can never pull the wizard into a different project.
  const entryProjectId = urlProjectId || activeProjectId || null;
  const entryVersionId = urlVersionId || null;

  // The wizard opens for a Cinema Designer create link or a sidebar entry. A
  // sidebar entry with an active project opens for that project; with no active
  // project it opens at the normal project-selection step. A draft is restored
  // only when it matches the entry project (and version, where supplied) — the
  // wizard's own read filters by these IDs, so a draft for another project is
  // never silently resumed.
  const [showWizard, setShowWizard] = useState(() => isCreateEntry || isSidebarEntry);
  const [regenerateFrom, setRegenerateFrom] = useState(null);
  const entryContext = useProposalEntryContext(entryProjectId, entryVersionId);
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  // A URL asking for a tab that is no longer offered is redirected to the
  // Proposal Library, and the stale parameter is dropped so the address matches
  // the page that is shown.
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab && requestedTab !== normaliseTab(requestedTab)) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('tab');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleCreated = (proposalId) => {
    setRegenerateFrom(null);
    navigate(`/ProposalEditor?proposalId=${proposalId}`);
  };

  /** Open the wizard — from scratch, or as a regeneration of a saved proposal. */
  const openWizard = (sourceProposal = null) => {
    setRegenerateFrom(sourceProposal);
    setShowWizard(true);
  };

  // ── Wizard view ──
  if (showWizard) {
    return (
      <div className="min-h-screen bg-[#FBFAF7]">
        <div className="max-w-3xl mx-auto px-8 lg:px-0 py-16">
          <button
            onClick={() => { setShowWizard(false); setRegenerateFrom(null); }}
            className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-[#8A8477] hover:text-[#213428] mb-10 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Proposal Centre
          </button>
          {!regenerateFrom && entryContext.loading ? <p role="status">Identifying proposal project…</p>
            : !regenerateFrom && entryContext.error ? <p role="alert">{entryContext.error}</p>
            : <CreateProposalWizard
            key={regenerateFrom?.id || `${entryContext.projectId || ''}|${entryContext.versionId || ''}`}
            initialProjectId={entryContext.projectId || null}
            initialVersionId={entryContext.versionId || null}
            onCreated={handleCreated}
            onCancel={() => { setShowWizard(false); setRegenerateFrom(null); }}
            regenerateFrom={regenerateFrom}
          />}
        </div>
      </div>
    );
  }

  // ── Default view ──
  return (
    <div className="min-h-screen bg-[#FBFAF7]">
      <div className="max-w-5xl mx-auto px-8 lg:px-0 py-16">
        {/* ── Editorial header ── */}
        <div className="flex items-start justify-between gap-8 mb-14">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#A79E8C] mb-4">
              Sound Proof
            </div>
            <h1
              className="text-[40px] leading-none font-normal text-[#1B1A1A] tracking-tight"
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              Proposal Centre
            </h1>
          </div>
          <button
            onClick={() => openWizard()}
            className="flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] text-white shrink-0 mt-2 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
          >
            <Plus className="w-3.5 h-3.5" />
            Create Proposal
          </button>
        </div>

        {/* ── Editorial tab navigation ── */}
        <div className="flex gap-10 border-b border-[#E5E1D8] mb-12">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`relative pb-4 text-[13px] uppercase tracking-[0.12em] transition-colors ${
                activeTab === key ? 'text-[#1B1A1A]' : 'text-[#A79E8C] hover:text-[#625143]'
              }`}
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              {label}
              {activeTab === key && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px]"
                  style={{ backgroundColor: '#213428' }}
                />
              )}
            </button>
          ))}
        </div>

        {activeTab === 'library' && (
          <ProposalLibraryTab
            onCreateProposal={() => openWizard()}
            onRegenerate={(proposal) => openWizard(proposal)}
          />
        )}
        {activeTab === 'brand' && <BrandAssetsPanel accountId={accountId} />}
      </div>
    </div>
  );
}