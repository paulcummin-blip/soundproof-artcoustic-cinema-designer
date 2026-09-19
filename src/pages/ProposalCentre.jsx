import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import BrandAssetsPanel from '@/components/proposal/BrandAssetsPanel';
import PlaceholderTab from '@/components/proposal/PlaceholderTab';
import CreateProposalWizard from '@/components/proposal/CreateProposalWizard';
import { Building2, FileText, Package, History, Plus, ChevronLeft } from 'lucide-react';

const TABS = [
  { key: 'brand', label: 'Brand Assets', icon: Building2 },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'products', label: 'Product Library', icon: Package },
  { key: 'history', label: 'Proposal History', icon: History },
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
      <div className="min-h-screen bg-[#F5F4F0] p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => setShowWizard(false)}
            className="flex items-center gap-1 text-sm text-[#625143] hover:text-[#213428] mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Proposal Centre
          </button>
          <CreateProposalWizard onCreated={handleCreated} onCancel={() => setShowWizard(false)} />
        </div>
      </div>
    );
  }

  // ── Default view ──
  return (
    <div className="min-h-screen bg-[#F5F4F0] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1
              className="text-2xl font-bold text-[#1B1A1A]"
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Proposal Centre
            </h1>
            <p className="text-sm text-[#625143] mt-1">
              The publishing area for all your proposals — create, manage, and export.
            </p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-md text-white shrink-0"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            <Plus className="w-4 h-4" />
            Create New Proposal
          </button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                activeTab === key
                  ? 'bg-[#213428] text-white border-[#213428]'
                  : 'bg-white text-[#3E4349] border-[#DCDBD6] hover:bg-[#F5F4F0]'
              }`}
              style={activeTab === key ? { fontFamily: 'Didact Gothic, sans-serif' } : {}}
            >
              <Icon className="w-4 h-4" />
              {label}
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