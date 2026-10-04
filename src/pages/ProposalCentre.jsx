import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import BrandAssetsPanel from '@/components/proposal/BrandAssetsPanel';
import PlaceholderTab from '@/components/proposal/PlaceholderTab';
import CreateProposalWizard from '@/components/proposal/CreateProposalWizard';
import ProposalLibraryTab from '@/components/proposal/library/ProposalLibraryTab';
import { Plus, ChevronLeft } from 'lucide-react';

const TABS = [
  { key: 'brand', label: 'Brand Assets' },
  { key: 'templates', label: 'Templates' },
  { key: 'products', label: 'Product Intelligence' },
  { key: 'library', label: 'Proposal Library' },
];

const PLACEHOLDER_CONTENT = {
  templates: {
    title: 'Templates',
    description:
      'Pre-designed proposal templates will live here. You will be able to create, edit, and manage reusable proposal layouts for different project types.',
  },
  products: {
    title: 'Product Intelligence',
    description:
      'Structured manufacturer knowledge for every Artcoustic product — why each model exists, where it should be used, its strengths, honest compromises, and upgrade path. Feeds Proposal Intelligence, product comparisons, and the dealer assistant.',
  },
};

import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function ProposalCentre() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('brand');
  const [showWizard, setShowWizard] = useState(false);
  const [regenerateFrom, setRegenerateFrom] = useState(null);
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

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

        {activeTab === 'brand' && <BrandAssetsPanel accountId={accountId} />}
        {activeTab === 'library' && (
          <ProposalLibraryTab
            onCreateProposal={() => openWizard()}
            onRegenerate={(proposal) => openWizard(proposal)}
          />
        )}
        {activeTab !== 'brand' && activeTab !== 'library' && (
          <PlaceholderTab
            title={PLACEHOLDER_CONTENT[activeTab].title}
            description={PLACEHOLDER_CONTENT[activeTab].description}
          />
        )}
      </div>
    </div>
  );
}