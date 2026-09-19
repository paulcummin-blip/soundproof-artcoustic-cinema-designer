import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useActiveProjectId } from '@/components/state/project-session';
import BrandAssetsPanel from '@/components/proposal/BrandAssetsPanel';
import ProposalAssetsPanel from '@/components/proposal/ProposalAssetsPanel';
import { Building2, Image } from 'lucide-react';

export default function ProposalCentre() {
  const { user } = useAuth();
  const activeProjectId = useActiveProjectId();
  const [activeTab, setActiveTab] = useState('brand');

  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  const tabButton = (key, Icon, label) => (
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
  );

  return (
    <div className="min-h-screen bg-[#F5F4F0] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1
            className="text-2xl font-bold text-[#1B1A1A]"
            style={{ fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Proposal Centre
          </h1>
          <p className="text-sm text-[#625143] mt-1">
            Manage brand assets and project proposal visuals. These are used by every proposal generated for your account.
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          {tabButton('brand', Building2, 'Brand Assets')}
          {tabButton('assets', Image, 'Proposal Assets')}
        </div>

        {activeTab === 'brand' && <BrandAssetsPanel accountId={accountId} />}
        {activeTab === 'assets' && <ProposalAssetsPanel projectId={activeProjectId} accountId={accountId} />}
      </div>
    </div>
  );
}