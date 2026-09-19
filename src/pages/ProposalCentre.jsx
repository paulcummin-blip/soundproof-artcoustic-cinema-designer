import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import BrandAssetsPanel from '@/components/proposal/BrandAssetsPanel';
import PlaceholderTab from '@/components/proposal/PlaceholderTab';
import CreateProposalWizard from '@/components/proposal/CreateProposalWizard';
import { Plus, ChevronLeft } from 'lucide-react';

const TABS = [
  { key: 'brand', label: 'Brand Assets' },
  { key: 'templates', label: 'Templates' },
  { key: 'products', label: 'Product Library' },
  { key: 'history', label: 'Proposal History' },
];

const PLACEHOLDER_CONTENT = {
  templates: {
    title: 'Templates',
    description:
      'Pre-designed proposal templates will live here. You will be able to create, edit, and manage reusable proposal layouts for different project types.',
  },
  products: {
    title: 'Product Library',
    description:
      'The product knowledge base will live here. Each product will contain hero images, transparent PNGs, lifestyle shots, descriptions, benefits, and technical notes that the proposal engine draws from.',
  },
  history: {
    title: 'Proposal History',
    description:
      'All generated proposals will be listed here with their status, date, and linked project.',
  },
};

export default function ProposalCentre() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('brand');
  const [showWizard, setShowWizard] = useState(false);
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  const handleCreated = (proposalId) => {
    navigate(`/ProposalEditor?proposalId=${proposalId}`);
  };

  // ── Wizard view ──
  if (showWizard) {
    return (
      <div className="min-h-screen bg-[#FBFAF7]">
        <div className="max-w-3xl mx-auto px-8 lg:px-0 py-16">
          <button
            onClick={() => setShowWizard(false)}
            className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-[#8A8477] hover:text-[#213428] mb-10 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Proposal Centre
          </button>
          <CreateProposalWizard onCreated={handleCreated} onCancel={() => setShowWizard(false)} />
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
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Proposal Centre
            </h1>
            <p className="text-sm text-[#8A8477] mt-4 max-w-md leading-relaxed">
              The publishing environment for every proposal — create, refine, and export.
            </p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] text-white shrink-0 mt-2 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
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
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
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
        {activeTab !== 'brand' && (
          <PlaceholderTab
            title={PLACEHOLDER_CONTENT[activeTab].title}
            description={PLACEHOLDER_CONTENT[activeTab].description}
          />
        )}
      </div>
    </div>
  );
}