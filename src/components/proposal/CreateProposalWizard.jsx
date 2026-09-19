import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { getProposalType } from '@/components/proposal/proposalTypes';
import WizardStepper from '@/components/proposal/wizard/WizardStepper';
import ProjectSelectStep from '@/components/proposal/wizard/ProjectSelectStep';
import ProposalTypeStep from '@/components/proposal/wizard/ProposalTypeStep';
import VersionSelectStep from '@/components/proposal/wizard/VersionSelectStep';
import NarrativeGoalStep from '@/components/proposal/wizard/NarrativeGoalStep';
import GenerateStep from '@/components/proposal/wizard/GenerateStep';

const STEPS = [
  { key: 'project', label: 'Project' },
  { key: 'type', label: 'Type' },
  { key: 'versions', label: 'Versions' },
  { key: 'goal', label: 'Goal' },
  { key: 'generate', label: 'Generate' },
];

/**
 * Create Proposal wizard — a multi-step flow that creates proposals
 * from any non-archived project, not just the active one.
 *
 * Steps:
 * 1. Select Project (any non-archived project for this dealer)
 * 2. Choose Proposal Type (single or comparison)
 * 3. Select Version(s) — one for single, two+ for comparison
 * 4. Choose Narrative Goal
 * 5. Generate (creates Proposal + blocks, invokes GPT, opens editor)
 *
 * The wizard is project-agnostic. The Proposal Editor becomes a
 * publishing tool that loads by proposal ID, not by active project.
 */
export default function CreateProposalWizard({ onCreated, onCancel }) {
  const { user } = useAuth();
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  const [step, setStep] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [proposalType, setProposalType] = useState('single');
  const [selectedVersionIds, setSelectedVersionIds] = useState([]);
  const [narrativeGoal, setNarrativeGoal] = useState('luxury_cinema');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectProject = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setSelectedVersionIds([]);
  }, []);

  const handleSelectType = useCallback((type) => {
    setProposalType(type);
    setSelectedVersionIds([]);
  }, []);

  const handleGenerate = async () => {
    if (!selectedProjectId || selectedVersionIds.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('generateProposal', {
        project_id: selectedProjectId,
        proposal_type: proposalType,
        selected_version_ids: selectedVersionIds,
        account_id: accountId,
        narrative_goal: narrativeGoal,
      });
      const proposalId = response?.data?.proposal_id;
      if (proposalId) {
        onCreated(proposalId);
      } else {
        throw new Error('No proposal ID returned');
      }
    } catch (err) {
      console.error('Generation failed:', err);
      setError(err?.message || 'Generation failed. Please try again.');
      setGenerating(false);
    }
  };

  // ── Generating screen ──
  if (generating) {
    return <GenerateStep error={error} onBack={() => setGenerating(false)} />;
  }

  const typeDef = getProposalType(proposalType);
  const versionsValid = proposalType === 'comparison'
    ? selectedVersionIds.length >= (typeDef?.minVersions || 2)
    : selectedVersionIds.length === 1;

  const canProceed = [
    !!selectedProjectId, // step 0
    !!proposalType, // step 1
    versionsValid, // step 2
    !!narrativeGoal, // step 3
  ];

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-[#A79E8C] mb-4">
        Step {step + 1} of {STEPS.length}
      </div>
      <h2
        className="text-[32px] leading-none font-normal text-[#1B1A1A] tracking-tight mb-10"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        Create Proposal
      </h2>

      <WizardStepper steps={STEPS} currentStep={step} />

      {/* Step 0 — Select Project */}
      {step === 0 && (
        <ProjectSelectStep
          selectedProjectId={selectedProjectId}
          onSelect={handleSelectProject}
        />
      )}

      {/* Step 1 — Choose Proposal Type */}
      {step === 1 && (
        <ProposalTypeStep selectedType={proposalType} onSelect={handleSelectType} />
      )}

      {/* Step 2 — Select Version(s) */}
      {step === 2 && (
        <VersionSelectStep
          projectId={selectedProjectId}
          proposalType={proposalType}
          selectedVersionIds={selectedVersionIds}
          onSelect={setSelectedVersionIds}
        />
      )}

      {/* Step 3 — Narrative Goal */}
      {step === 3 && (
        <NarrativeGoalStep selectedGoal={narrativeGoal} onSelect={setNarrativeGoal} />
      )}

      {/* Step 4 — Review & Generate */}
      {step === 4 && (
        <div>
          <div className="mb-10">
            <ReviewRow label="Project" value={selectedProjectId ? 'Selected' : '—'} />
            <ReviewRow
              label="Proposal Type"
              value={typeDef?.label || '—'}
            />
            <ReviewRow
              label="Versions"
              value={`${selectedVersionIds.length} selected`}
            />
            <ReviewRow
              label="Narrative Goal"
              value={narrativeGoal ? narrativeGoal.replace(/_/g, ' ') : '—'}
              last
            />
          </div>
          <p className="text-sm text-[#8A8477] mb-10 leading-relaxed">
            Generate to create the proposal and open the editor. GPT will write a complete
            first draft.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-4 mt-12 pt-8 border-t border-[#E5E1D8]">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-[#625143] hover:text-[#1B1A1A] transition-colors"
          >
            Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed[step]}
            className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Next
          </button>
        )}
        {step === STEPS.length - 1 && (
          <button
            onClick={handleGenerate}
            disabled={!canProceed[0] || !canProceed[2] || !canProceed[3]}
            className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Generate Proposal
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-[#A79E8C] hover:text-[#625143] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value, last }) {
  return (
    <div className={`flex items-center justify-between py-3 ${last ? '' : 'border-b border-[#E5E1D8]'}`}>
      <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]">{label}</span>
      <span
        className="text-sm text-[#1B1A1A] capitalize"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        {value}
      </span>
    </div>
  );
}