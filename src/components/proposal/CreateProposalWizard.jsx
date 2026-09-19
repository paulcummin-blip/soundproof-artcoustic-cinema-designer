import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useActiveProjectId } from '@/components/state/project-session';
import { useAuth } from '@/lib/AuthContext';
import { NARRATIVE_GOALS } from '@/components/proposal/proposalSections';
import { Loader2, Sparkles, ChevronRight } from 'lucide-react';

/**
 * Create Proposal wizard — selects a project version and Narrative Goal,
 * then triggers GPT generation of a complete proposal.
 *
 * Steps:
 * 1. Choose Version (if project has multiple versions)
 * 2. Narrative Goal
 * 3. Generate (creates Proposal + blocks, invokes GPT, redirects to editor)
 */
export default function CreateProposalWizard({ onCreated, onCancel }) {
  const { user } = useAuth();
  const activeProjectId = useActiveProjectId();
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  const [step, setStep] = useState(0);
  const [versions, setVersions] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [narrativeGoal, setNarrativeGoal] = useState('luxury_cinema');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [projectResults, versionResults] = await Promise.all([
          base44.entities.Project.filter({ id: activeProjectId }),
          base44.entities.ProjectVersion.filter({ project_id: activeProjectId }),
        ]);
        setProject(projectResults?.[0] || null);
        const sorted = (versionResults || []).sort((a, b) => (a.version_number || 0) - (b.version_number || 0));
        setVersions(sorted);
        const activeVersionId = projectResults?.[0]?.active_version_id;
        if (activeVersionId && sorted.some((v) => v.id === activeVersionId)) {
          setSelectedVersionId(activeVersionId);
        } else if (sorted.length > 0) {
          setSelectedVersionId(sorted[0].id);
        }
      } catch (err) {
        console.error('Failed to load project/versions:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeProjectId]);

  const handleGenerate = async () => {
    if (!activeProjectId || !selectedVersionId) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('generateProposal', {
        project_id: activeProjectId,
        version_id: selectedVersionId,
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

  if (!activeProjectId) {
    return (
      <div className="p-8 text-center text-[#625143]">
        No active project. Open a project first.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#625143] animate-spin" />
      </div>
    );
  }

  // ── Generating screen ──
  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#213428] animate-spin mb-4" />
        <h3
          className="text-lg font-bold text-[#1B1A1A]"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Generating Proposal
        </h3>
        <p className="text-sm text-[#625143] mt-2">
          GPT is writing your complete proposal. This takes 30-60 seconds.
        </p>
      </div>
    );
  }

  // ── Error screen ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={() => setGenerating(false)}
          className="px-4 py-2 text-sm rounded-md border border-[#DCDBD6] text-[#3E4349] hover:bg-[#F5F4F0]"
        >
          Back
        </button>
      </div>
    );
  }

  // ── Step 0: Choose Version ──
  if (step === 0) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <h2
          className="text-xl font-bold text-[#1B1A1A] mb-2"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Create Proposal
        </h2>
        <p className="text-sm text-[#625143] mb-6">Step 1 of 2 — Choose a project version</p>

        {versions.length === 0 ? (
          <p className="text-sm text-[#625143]">This project has no versions yet.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVersionId(v.id)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  selectedVersionId === v.id
                    ? 'bg-[#213428] text-white border-[#213428]'
                    : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:bg-[#F5F4F0]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                      Version {v.version_number}
                    </div>
                    <div className={`text-sm ${selectedVersionId === v.id ? 'text-white/70' : 'text-[#625143]'}`}>
                      {v.version_name || 'Current Design'}
                    </div>
                  </div>
                  {selectedVersionId === v.id && <ChevronRight className="w-5 h-5" />}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 mt-8">
          <button
            onClick={() => setStep(1)}
            disabled={!selectedVersionId}
            className="px-5 py-2.5 text-sm rounded-md text-white disabled:opacity-50"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Next: Narrative Goal
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2.5 text-sm rounded-md border border-[#DCDBD6] text-[#3E4349] hover:bg-[#F5F4F0]"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Step 1: Narrative Goal ──
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h2
        className="text-xl font-bold text-[#1B1A1A] mb-2"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        Create Proposal
      </h2>
      <p className="text-sm text-[#625143] mb-6">Step 2 of 2 — Choose a Narrative Goal</p>
      <p className="text-xs text-[#625143] mb-4">
        This gives the proposal its personality. GPT reads this before anything else. You can change it later.
      </p>

      <div className="space-y-2">
        {NARRATIVE_GOALS.map((goal) => (
          <button
            key={goal.value}
            onClick={() => setNarrativeGoal(goal.value)}
            className={`w-full text-left p-4 rounded-lg border transition-colors ${
              narrativeGoal === goal.value
                ? 'bg-[#213428] text-white border-[#213428]'
                : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:bg-[#F5F4F0]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                  {goal.label}
                </div>
                <div className={`text-sm ${narrativeGoal === goal.value ? 'text-white/70' : 'text-[#625143]'}`}>
                  {goal.description}
                </div>
              </div>
              {narrativeGoal === goal.value && <Sparkles className="w-5 h-5" />}
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={() => setStep(0)}
          className="px-4 py-2.5 text-sm rounded-md border border-[#DCDBD6] text-[#3E4349] hover:bg-[#F5F4F0]"
        >
          Back
        </button>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-md text-white"
          style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
        >
          <Sparkles className="w-4 h-4" />
          Generate Proposal
        </button>
      </div>
    </div>
  );
}