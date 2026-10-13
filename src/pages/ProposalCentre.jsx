import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import BrandAssetsPanel from '@/components/proposal/BrandAssetsPanel';
import CreateProposalWizard from '@/components/proposal/CreateProposalWizard';
import { hasResumableDraft } from '@/components/proposal/wizard/proposalWizardDraft';
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
  // The wizard can also be opened from another page — the Project Library's
  // readiness banner links to ?create=1 — so the flag is read from the URL as
  // well as from the Create Proposal button below.
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => normaliseTab(searchParams.get('tab')));
  // A proposal the designer stepped away from — to record an assessment or to bring
  // a Project Report up to date — reopens where they left it: their project, type,
  // versions, brief, answers and step all return, and the Generate they had already
  // asked for continues by itself.
  const [showWizard, setShowWizard] = useState(() => searchParams.get('create') === '1' || hasResumableDraft());
  const [regenerateFrom, setRegenerateFrom] = useState(null);
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
          <CreateProposalWizard
            onCreated={handleCreated}
            onCancel={() => { setShowWizard(false); setRegenerateFrom(null); }}
            regenerateFrom={regenerateFrom}
          />
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
            <p className="text-sm text-[#8A8477] mt-4 max-w-md leading-relaxed">
              The publishing environment for every proposal — create, refine, and export.
            </p>
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