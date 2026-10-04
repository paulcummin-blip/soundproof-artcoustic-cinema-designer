import React, { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { getProposalType } from '@/components/proposal/proposalTypes';
import WizardStepper from '@/components/proposal/wizard/WizardStepper';
import ProjectSelectStep from '@/components/proposal/wizard/ProjectSelectStep';
import ProposalTypeStep from '@/components/proposal/wizard/ProposalTypeStep';
import VersionSelectStep from '@/components/proposal/wizard/VersionSelectStep';
import ClientBriefStep from '@/components/proposal/wizard/ClientBriefStep';
import GenerateStep, { GENERATION_PHASE } from '@/components/proposal/wizard/GenerateStep';
import { confirmProposalSectionsSaved } from '@/components/proposal/wizard/proposalHandoffAuthority';
import { useVersionedEngineeringSnapshot } from '@/components/proposal/engineeringAuthority/useVersionedEngineeringSnapshot';
import { buildSelectedVersionSnapshots } from '@/components/proposal/engineeringAuthority/buildSelectedVersionSnapshots';
import { useSelectedVersionSnapshots } from '@/components/proposal/engineeringAuthority/useSelectedVersionSnapshots';
import { useProposalReadiness } from '@/components/proposal/sourceAuthority/useProposalReadiness';
import { resolveProposalReadinessGate } from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';
import VersionReadinessTable from '@/components/proposal/sourceAuthority/VersionReadinessTable';

const STEPS = [
  { key: 'project', label: 'Project' },
  { key: 'type', label: 'Type' },
  { key: 'versions', label: 'Versions' },
  { key: 'brief', label: 'Brief' },
  { key: 'generate', label: 'Generate' },
];

/**
 * Create Proposal wizard — a multi-step flow that creates proposals
 * from any non-archived project, not just the active one.
 *
 * Steps:
 * 1. Select Project (any non-archived project for this dealer)
 * 2. Choose Report Type (System Design Summary or System Design Comparison)
 * 3. Select Version(s) — one for a summary, two or more for a comparison
 * 4. Client Brief & Narrative Focus
 * 5. Generate (creates Proposal + blocks, invokes GPT, opens editor)
 *
 * The wizard is project-agnostic. The Proposal Editor becomes a
 * publishing tool that loads by proposal ID, not by active project.
 */
export default function CreateProposalWizard({ onCreated, onCancel, regenerateFrom = null }) {
  const { user } = useAuth();
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  // Regeneration starts from the proposal it revises: project, report type,
  // versions and client brief are carried across, and the new proposal is linked
  // back to the original, which is never modified.
  const [step, setStep] = useState(regenerateFrom ? 2 : 0);
  const [selectedProjectId, setSelectedProjectId] = useState(regenerateFrom?.project_id || null);
  const [proposalType, setProposalType] = useState(regenerateFrom?.proposal_type || null);
  const [selectedVersionIds, setSelectedVersionIds] = useState(() => {
    if (!regenerateFrom) return [];
    const selected = Array.isArray(regenerateFrom.selected_version_ids)
      ? regenerateFrom.selected_version_ids.filter(Boolean)
      : [];
    return selected.length > 0 ? selected : (regenerateFrom.version_id ? [regenerateFrom.version_id] : []);
  });
  const [clientBrief, setClientBrief] = useState(regenerateFrom?.client_brief || '');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [blockedAttempt, setBlockedAttempt] = useState(false);
  // Which of the four generation states is on screen: preparing, writing,
  // opening the editor, ready. Null when Step 5 has not started.
  const [generationPhase, setGenerationPhase] = useState(null);
  const parentProposalId = regenerateFrom?.id || null;
  const generationInFlightRef = useRef(false);
  const creationRequestIdRef = useRef(null);

  // ── Stage 2A: Frozen Engineering Snapshot ──
  // Assemble the snapshot from the canonical authorities for the first selected
  // version. This is the version-safe engineering truth that will be stored on
  // the Proposal at generation time. Later Room Designer edits do NOT silently
  // change an existing proposal.
  const snapshotVersionId = selectedVersionIds[0] || null;
  const {
    snapshot: engineeringSnapshot,
    loading: snapshotLoading,
    error: snapshotError,
    version: selectedVersion,
  } = useVersionedEngineeringSnapshot(selectedProjectId, snapshotVersionId);

  // ── Comparison-mode Client Brief examples ──
  // In comparison mode the Brief examples are built from EVERY selected
  // version's own frozen snapshot, read from the same published authority the
  // report is generated from. Single-version proposals need nothing here.
  const {
    versions: selectedVersionSnapshots,
    loading: selectedVersionsLoading,
  } = useSelectedVersionSnapshots({
    projectId: selectedProjectId,
    versionIds: selectedVersionIds,
    primaryVersionId: snapshotVersionId,
    primarySnapshot: engineeringSnapshot,
    enabled: step >= 3 && selectedVersionIds.length > 1,
  });

  // ── Shared per-version readiness (Step 3 and Step 5) ──
  // ONE readiness result covering EVERY selected version: the same rows drive
  // the version-selection warnings, the Step 5 table, the blocking message and
  // the Generate button. A System Design Comparison is judged per version, never
  // from the first selected version alone.
  // ONE authority. This single result drives the Step 3 warning, the Step 5
  // table, the blocking message and the Generate button — the same rule the
  // server gate applies. There is deliberately no second, legacy report-ready
  // boolean: that is exactly what allowed the panel to read Current while the
  // Generate button claimed the reports were missing.
  const {
    rows: readinessRows,
    loading: readinessLoading,
    error: readinessError,
    retry: retryReadiness,
  } = useProposalReadiness({
    projectId: selectedProjectId,
    versionIds: selectedVersionIds,
  });
  const selectedType = getProposalType(proposalType);
  const baseReadiness = resolveProposalReadinessGate({
    rows: readinessRows,
    loading: readinessLoading,
    minVersions: selectedType?.minVersions || 1,
    maxVersions: selectedType?.maxVersions ?? null,
  });

  // The frozen engineering snapshot of the primary version must exist before
  // anything can be generated from it.
  const proposalDataReady = !snapshotLoading && !!engineeringSnapshot && !snapshotError;
  const readiness = {
    ...baseReadiness,
    checking: baseReadiness.checking || snapshotLoading,
    ready: baseReadiness.ready && proposalDataReady,
    message: baseReadiness.ready && !proposalDataReady && !snapshotLoading
      ? (snapshotError || 'Complete every project assessment before generating reports or proposals.')
      : baseReadiness.message,
    detail: baseReadiness.ready && !proposalDataReady && !snapshotLoading
      ? 'Open this version in Room Designer, finish the remaining calculations, then regenerate the reports.'
      : baseReadiness.detail,
  };

  const handleSelectProject = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setSelectedVersionIds([]);
    creationRequestIdRef.current = null;
  }, []);

  const handleSelectType = useCallback((type) => {
    setProposalType(type);
    setSelectedVersionIds([]);
    creationRequestIdRef.current = null;
  }, []);

  const handleSelectVersions = useCallback((versionIds) => {
    setSelectedVersionIds(versionIds);
    creationRequestIdRef.current = null;
  }, []);

  const handleClientBriefChange = useCallback((brief) => {
    setClientBrief(brief);
    creationRequestIdRef.current = null;
  }, []);

  const handleGenerate = async () => {
    if (generationInFlightRef.current || !selectedProjectId || selectedVersionIds.length === 0) return;
    // Source authority: no current reports, no proposal. ONE authority decides
    // this, so the button can never disagree with the panel above it.
    if (!readiness.ready) {
      setError(readiness.message
        || 'Every selected version needs its current reports before this proposal can be generated.');
      return;
    }
    if (!engineeringSnapshot) {
      setError(snapshotError || 'Open the selected version in Room Designer and calculate its engineering results before generating the proposal.');
      return;
    }
    generationInFlightRef.current = true;
    setGenerating(true);
    setGenerationPhase(GENERATION_PHASE.PREPARING);
    setError(null);
    const requestId = creationRequestIdRef.current || createRequestId();
    creationRequestIdRef.current = requestId;
    try {
      // Every selected version contributes its own frozen engineering evidence.
      // The primary snapshot is reused exactly as the single-report path uses
      // it; every other version is read from the same published authority, so a
      // comparison is never written from one version's results.
      const versionSnapshots = selectedVersionIds.length > 1
        ? await buildSelectedVersionSnapshots({
          projectId: selectedProjectId,
          versionIds: selectedVersionIds,
          primaryVersionId: snapshotVersionId,
          primarySnapshot: engineeringSnapshot,
        })
        : [{
          version_id: snapshotVersionId,
          version_name: selectedVersion?.version_name || null,
          snapshot: engineeringSnapshot,
        }];

      const missingSnapshots = versionSnapshots.filter((entry) => !entry.snapshot || entry.snapshot.available !== true);
      if (missingSnapshots.length > 0) {
        setError(proposalType === 'comparison'
          ? 'Comparison evidence could not be built for both selected versions. Regenerate the Visual and Technical Reports for each version, then try again.'
          : `No calculated engineering result was found for ${missingSnapshots.map((entry) => entry.version_name || entry.version_id).join(', ')}.`);
        return;
      }

      setGenerationPhase(GENERATION_PHASE.WRITING);
      const response = await base44.functions.invoke('generateProposal', {
        request_id: requestId,
        project_id: selectedProjectId,
        proposal_type: proposalType,
        selected_version_ids: selectedVersionIds,
        // A regeneration creates a NEW linked revision. The original proposal is
        // never modified.
        parent_proposal_id: parentProposalId,
        account_id: accountId,
        narrative_goal: 'luxury_cinema',
        client_brief: clientBrief,
        // The frozen Engineering Snapshot for the primary version, plus one
        // frozen evidence entry per selected version for a comparison.
        engineering_snapshot: engineeringSnapshot || null,
        engineering_snapshots: versionSnapshots.map((entry) => ({
          version_id: entry.version_id,
          version_name: entry.version_name || null,
          snapshot: entry.snapshot,
        })),
      });
      const proposalId = response?.data?.proposal_id;
      if (proposalId) {
        // The editor reads a proposal and its sections, so it opens only once
        // they are saved — never on the strength of the call returning.
        setGenerationPhase(GENERATION_PHASE.OPENING);
        const handoff = await confirmProposalSectionsSaved(proposalId);
        if (!handoff.ok) throw new Error(handoff.reason);
        setGenerationPhase(GENERATION_PHASE.READY);
        onCreated(proposalId);
      } else {
        throw new Error('No proposal ID returned');
      }
    } catch (err) {
      console.error('Generation failed:', err);
      const errorData = err?.response?.data;
      if (errorData?.cleanup_succeeded === true) {
        creationRequestIdRef.current = null;
      }
      setGenerationPhase(GENERATION_PHASE.FAILED);
      setError(errorData?.error || err?.message || 'Generation failed. Please try again.');
      setGenerating(false);
    } finally {
      generationInFlightRef.current = false;
    }
  };

  // ── Generating screen ──
  if (generating) {
    return (
      <GenerateStep
        phase={generationPhase || GENERATION_PHASE.PREPARING}
        error={error}
        onRetry={handleGenerate}
        onBack={() => {
          setGenerating(false);
          setGenerationPhase(null);
        }}
      />
    );
  }

  const typeDef = getProposalType(proposalType);
  const versionsValid = proposalType === 'comparison'
    ? selectedVersionIds.length >= (typeDef?.minVersions || 2)
    : selectedVersionIds.length === 1;

  const canProceed = [
    !!selectedProjectId, // step 0
    !!proposalType, // step 1
    // Choosing versions stays smooth — the readiness table warns while the
    // designer selects, and the hard block lands when Next is pressed.
    versionsValid, // step 2
    true, // step 3 — client brief is optional
  ];

  // Why Generate Proposal cannot be pressed, in words — or null when it can.
  // One named reason, from the same authorities the generation itself uses: a
  // disabled button is never left unexplained, and a reason is never stated for
  // a condition that is not actually blocking.
  const generateBlockReason = (() => {
    if (!canProceed[0]) return 'Choose a project to generate a proposal for.';
    if (!canProceed[1]) return 'Choose the report type to generate.';
    if (!canProceed[2]) {
      const minimum = selectedType?.minVersions || 1;
      return minimum > 1
        ? `Select at least ${minimum} versions to compare.`
        : 'Select the version this proposal is for.';
    }
    if (readinessLoading || snapshotLoading) return 'Checking the selected versions…';
    if (selectedVersionIds.length > 1 && selectedVersionsLoading) return 'Reading the selected versions…';
    // Every selected version is judged by its own readiness — ONE authority,
    // the same result the table above shows. A separate legacy source boolean
    // is never consulted: it is what let the panel read Current while the
    // button claimed the reports were missing. A comparison is not held up by a
    // single-version requirement.
    if (readinessError) {
      return 'The saved reports and engineering results could not be read. Retry the read, then generate the proposal.';
    }
    if (!readiness.ready) {
      return readiness.message || 'Every selected version needs its current reports before this proposal can be generated.';
    }
    // A comparison is generated from each version's own frozen evidence, which
    // is read and verified when generation starts — so the versions are the
    // requirement here, not one primary snapshot.
    if (selectedVersionIds.length > 1) return null;
    if (!engineeringSnapshot) {
      return snapshotError
        || 'This version has no calculated engineering result to freeze into the proposal. Open it in Room Designer and calculate it first.';
    }
    return null;
  })();

  const handleNext = () => {
    if (step === 2 && versionsValid && !readiness.ready) {
      setBlockedAttempt(true);
      return;
    }
    setBlockedAttempt(false);
    setStep(step + 1);
  };

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

      {parentProposalId && (
        <p className="text-sm text-[#625143] leading-relaxed mb-10 -mt-6">
          Regenerating from the original proposal. A new revision will be created and linked to it —
          the original is kept exactly as it is.
        </p>
      )}

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
          onSelect={handleSelectVersions}
          readiness={readiness}
        />
      )}

      {/* Step 3 — Client Brief & Narrative Focus */}
      {step === 3 && (
        <ClientBriefStep
          value={clientBrief}
          onChange={handleClientBriefChange}
          projectId={selectedProjectId}
          selectedVersionIds={selectedVersionIds}
          proposalType={proposalType}
          engineeringSnapshot={engineeringSnapshot}
          versionSnapshots={selectedVersionSnapshots}
          versionsLoading={selectedVersionsLoading}
          snapshotLoading={snapshotLoading}
        />
      )}

      {/* Step 4 — Review & Generate */}
      {step === 4 && (
        <div>
          {/* The same per-version readiness result as the Versions step. */}
          <VersionReadinessTable
            gate={readiness}
            projectId={selectedProjectId}
            className="mb-8"
            onRetry={readinessError ? retryReadiness : null}
          />
          <div className="mb-10">
            <ReviewRow label="Project" value={selectedProjectId ? 'Selected' : '—'} />
            <ReviewRow
              label="Report Type"
              value={typeDef?.label || '—'}
            />
            <ReviewList
              label="Versions"
              values={readinessRows.length > 0
                ? readinessRows.map((row) => row.versionName)
                : selectedVersionIds.map((versionId, index) => `Version ${index + 1}`)}
            />
            <ReviewRow
              label="Client Brief"
              value={clientBrief ? `${clientBrief.slice(0, 60)}${clientBrief.length > 60 ? '…' : ''}` : '—'}
              last
            />
          </div>
          <p className="text-sm text-[#8A8477] mb-4 leading-relaxed">
            Generate to create the proposal and open the editor. A complete first draft will be
            written from the current Visual and Technical Report data for the selected versions.
          </p>
          {snapshotLoading && (
            <p className="text-sm text-[#8A8477] mb-6">Reading the published engineering result…</p>
          )}
          {!snapshotLoading && snapshotError && (
            <p className="text-sm text-[#7A2E10] mb-6">{snapshotError}</p>
          )}
          {!snapshotLoading && error && (
            <p role="alert" className="text-sm text-[#7A2E10] mb-6">{error}</p>
          )}
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
            onClick={handleNext}
            disabled={!canProceed[step]}
            className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Next
          </button>
        )}
        {blockedAttempt && step === 2 && !readiness.ready && !readiness.checking && (
          <span role="alert" className="self-center text-xs text-[#7A2E10]">
            {readiness.message || 'Fix the blocked versions below to continue.'}
          </span>
        )}
        {step === STEPS.length - 1 && (
          <button
            onClick={handleGenerate}
            disabled={!!generateBlockReason}
            className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Generate Proposal
          </button>
        )}
        {/* A disabled Generate Proposal always says why, in the same words the
            gate itself is decided by. */}
        {step === STEPS.length - 1 && generateBlockReason && (
          <span role="alert" className="self-center text-xs text-[#7A2E10] max-w-md">
            {generateBlockReason}
          </span>
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

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    || `proposal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** A label with a stacked list of values — the versions the proposal covers. */
function ReviewList({ label, values = [], last }) {
  return (
    <div className={`flex items-start justify-between gap-6 py-3 ${last ? '' : 'border-b border-[#E5E1D8]'}`}>
      <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C] pt-0.5">{label}</span>
      <ul
        className="text-sm text-[#1B1A1A] text-right space-y-0.5"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        {values.length > 0
          ? values.map((value) => <li key={value}>{value}</li>)
          : <li>—</li>}
      </ul>
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