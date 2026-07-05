// investigationManifest.jsx
// Data-only manifest describing every bass investigation audit panel, in chronological
// order (oldest first, newest last). UI-organisation only — no audit logic, physics,
// calculations, or component props were changed. Each entry's `render(ctx)` renders the
// exact same component with the exact same props as before this refactor.
//
// Status is metadata only. Valid values: ACTIVE, IN REVIEW, VERIFIED, RETIRED, FAILED.
// The newest entry defaults to ACTIVE unless a different status is set explicitly here.
// Any future investigation should simply be appended to the end of this array — the
// notebook UI (Active / Recent / Retired + timeline) derives itself from this list
// automatically, with no further UI changes required.

import React from "react";
import ImageSourceParityShootout from "@/components/room/bass/ImageSourceParityShootout";
import QClampBypassABTest from "@/components/room/bass/QClampBypassABTest";
import LiveModalContributorAudit from "@/components/room/bass/LiveModalContributorAudit";
import LiveModalVectorBuildPanel from "@/components/room/bass/LiveModalVectorBuildPanel";
import NullRecoveryMechanismAudit from "@/components/room/bass/NullRecoveryMechanismAudit";
import NullVectorDecompositionAudit from "@/components/room/bass/NullVectorDecompositionAudit";
import LiveVectorGeometryAudit from "@/components/room/bass/LiveVectorGeometryAudit";
import PhaseEvolutionModalTransferAudit from "@/components/room/bass/PhaseEvolutionModalTransferAudit";
import ProjectionMathematicsAudit from "@/components/room/bass/ProjectionMathematicsAudit";
import DominantModeConstructionAudit from "@/components/room/bass/DominantModeConstructionAudit";
import RewTransferFunctionParityAudit from "@/components/room/bass/RewTransferFunctionParityAudit";
import ModalPhysicsInputAudit from "@/components/room/bass/ModalPhysicsInputAudit";
import ModalEquationForensicsAudit from "@/components/room/bass/ModalEquationForensicsAudit";
import MultiModeInteractionAudit from "@/components/room/bass/MultiModeInteractionAudit";
import ModalTransferSkirtShapeAudit from "@/components/room/bass/ModalTransferSkirtShapeAudit";
import IsolatedModalTransferRootCauseAudit from "@/components/room/bass/IsolatedModalTransferRootCauseAudit";
import FrequencyScalingChainAudit from "@/components/room/bass/FrequencyScalingChainAudit";
import QTransferResolutionAudit from "@/components/room/bass/QTransferResolutionAudit";
import PressureAssemblyAudit from "@/components/room/bass/PressureAssemblyAudit";
import ModalExcitationAudit from "@/components/room/bass/ModalExcitationAudit";
import ModalPhaseRotationABTest from "@/components/room/bass/ModalPhaseRotationABTest";
import ModalEnergyBudgetAudit from "@/components/room/bass/ModalEnergyBudgetAudit";
import SourceExcitationRealityAudit from "@/components/room/bass/SourceExcitationRealityAudit";
import SourceCurveRootCauseAudit from "@/components/room/bass/SourceCurveRootCauseAudit";
import SourceCurveABCAudit from "@/components/room/bass/SourceCurveABCAudit";
import ModeAxisIdentityAudit from "@/components/room/bass/ModeAxisIdentityAudit";
import AxialPhaseSignParityAudit from "@/components/room/bass/AxialPhaseSignParityAudit";
import DirectModalVectorBalanceAudit from "@/components/room/bass/DirectModalVectorBalanceAudit";
import ReflectionModalDoubleCountingAudit from "@/components/room/bass/ReflectionModalDoubleCountingAudit";
import ReflectionVectorPhaseTraceAudit from "@/components/room/bass/ReflectionVectorPhaseTraceAudit";
import ReflectionOrderContributionAudit from "@/components/room/bass/ReflectionOrderContributionAudit";
import SchroederHandoffABAudit from "@/components/room/bass/SchroederHandoffABAudit";
import RewReferenceFeatureMatchAudit from "@/components/room/bass/RewReferenceFeatureMatchAudit";
import LfReflectionHandoffPrototypeBenchmark from "@/components/room/bass/LfReflectionHandoffPrototypeBenchmark";
import ReflectionInjectionLocationAudit from "@/components/room/bass/ReflectionInjectionLocationAudit";
import FreqDepQAuditPanel from "@/components/room/bass/FreqDepQAuditPanel";
import ModalTransferConstructionAudit from "@/components/room/bass/ModalTransferConstructionAudit";
import ModalDistanceScalingABAudit from "@/components/room/bass/ModalDistanceScalingABAudit";
import ImageSourceGeometryAudit from "@/components/room/bass/ImageSourceGeometryAudit";
import ModalAccumulationArchitectureAudit from "@/components/room/bass/ModalAccumulationArchitectureAudit";
import FrontWallAbsorptionSensitivityAudit from "@/components/room/bass/FrontWallAbsorptionSensitivityAudit";
import AbsorptionAuthorityAudit from "@/components/room/bass/AbsorptionAuthorityAudit";
import ModalQTransferAuthorityAudit from "@/components/room/bass/ModalQTransferAuthorityAudit";
import StorageFactorDominanceAudit from "@/components/room/bass/StorageFactorDominanceAudit";
import RootCauseShootoutAudit from "@/components/room/bass/RootCauseShootoutAudit";
import ModalFieldInternalShootoutAudit from "@/components/room/bass/ModalFieldInternalShootoutAudit";
import ModalPhaseReceiverCouplingDecisionAudit from "@/components/room/bass/ModalPhaseReceiverCouplingDecisionAudit";
import AbsorptionAuthorityRootCauseAudit from "@/components/room/bass/AbsorptionAuthorityRootCauseAudit";
import Case035NullCauseIsolationAudit from "@/components/room/bass/Case035NullCauseIsolationAudit";
import Case036FinalPressureCombinationAudit from "@/components/room/bass/Case036FinalPressureCombinationAudit";
import Case037OffResonanceModalTailAudit from "@/components/room/bass/Case037OffResonanceModalTailAudit";
import Case038Full30HzVectorLedger from "@/components/room/bass/Case038Full30HzVectorLedger";
import Case039ModalTransferPhaseFunctionAudit from "@/components/room/bass/Case039ModalTransferPhaseFunctionAudit";
import Case040OffResonanceModalMagnitudeFalloffAudit from "@/components/room/bass/Case040OffResonanceModalMagnitudeFalloffAudit";
import Case041MultiRoomModalSourceAmplitudeCheck from "@/components/room/bass/Case041MultiRoomModalSourceAmplitudeCheck";
import Case042ResonantTransferEquationParityCheck from "@/components/room/bass/Case042ResonantTransferEquationParityCheck";
import Case043SourceReceiverCouplingParityAudit from "@/components/room/bass/Case043SourceReceiverCouplingParityAudit";
import Case044RewAxisMappingFinalCheck from "@/components/room/bass/Case044RewAxisMappingFinalCheck";
import Case045ModalOverlapWeightingShootoutAudit from "@/components/room/bass/Case045ModalOverlapWeightingShootoutAudit";
import Case046ModalContributionNormalisationShootoutAudit from "@/components/room/bass/Case046ModalContributionNormalisationShootoutAudit";
import Case047FiveRoomBandwidthScaleCalibrationAudit from "@/components/room/bass/Case047FiveRoomBandwidthScaleCalibrationAudit";
import Case048DampingUnitScaleFactorAudit from "@/components/room/bass/Case048DampingUnitScaleFactorAudit";
import Case049SourceExcitationModelShootoutAudit from "@/components/room/bass/Case049SourceExcitationModelShootoutAudit";
import Case050ComplexSummationIntegrityAudit from "@/components/room/bass/Case050ComplexSummationIntegrityAudit";
import Case051TextbookAnalyticalSolverCrossCheckAudit from "@/components/room/bass/Case051TextbookAnalyticalSolverCrossCheckAudit";
import Case052SeatPositionNullAlignmentAudit from "@/components/room/bass/Case052SeatPositionNullAlignmentAudit";
import Case053ListenerCoordinateVerificationAudit from "@/components/room/bass/Case053ListenerCoordinateVerificationAudit";
import Case054ModalPhaseValidationAudit from "@/components/room/bass/Case054ModalPhaseValidationAudit";
import Case055ModalEigenfunctionSpatialBasisAudit from "@/components/room/bass/Case055ModalEigenfunctionSpatialBasisAudit";
import Case056DirectReflectionPathValidationAudit from "@/components/room/bass/Case056DirectReflectionPathValidationAudit";

// Chronological order: oldest first, newest (current investigation) last.
// `status` is explicit metadata; omit it to default to RETIRED (auto-assigned below),
// except the very last entry, which defaults to ACTIVE.
const RAW_ENTRIES = [
  { key: "direct-modal-vector-balance", title: "Direct / Modal Vector Balance Audit", status: "RETIRED",
    render: (ctx) => <DirectModalVectorBalanceAudit /> },
  { key: "reflection-modal-double-counting", title: "Reflection / Modal Double-Counting Audit", status: "RETIRED",
    render: (ctx) => <ReflectionModalDoubleCountingAudit /> },
  { key: "reflection-vector-phase-trace", title: "Reflection Vector Phase Trace Audit", status: "RETIRED",
    render: (ctx) => <ReflectionVectorPhaseTraceAudit /> },
  { key: "reflection-order-contribution", title: "Reflection Order Contribution Audit", status: "RETIRED",
    render: (ctx) => <ReflectionOrderContributionAudit /> },
  { key: "reflection-injection-location", title: "Reflection Injection Location Audit", status: "RETIRED",
    render: (ctx) => <ReflectionInjectionLocationAudit /> },
  { key: "modal-transfer-construction", title: "Modal Transfer Construction Audit", status: "RETIRED",
    render: (ctx) => <ModalTransferConstructionAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "schroeder-handoff-ab", title: "Schroeder Handoff A/B Audit", status: "RETIRED",
    render: (ctx) => <SchroederHandoffABAudit /> },

  { key: "live-vector-geometry", title: "Live Vector Geometry Audit", status: "RETIRED",
    render: (ctx) => <LiveVectorGeometryAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "projection-mathematics", title: "Projection Mathematics Audit", status: "RETIRED",
    render: (ctx) => <ProjectionMathematicsAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "dominant-mode-construction", title: "Dominant Mode Construction Audit", status: "RETIRED",
    render: (ctx) => <DominantModeConstructionAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "rew-transfer-function-parity", title: "REW Transfer Function Parity Audit", status: "RETIRED",
    render: (ctx) => <RewTransferFunctionParityAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "modal-physics-input", title: "Modal Physics Input Audit", status: "RETIRED",
    render: (ctx) => <ModalPhysicsInputAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "modal-equation-forensics", title: "Modal Equation Forensics Audit", status: "RETIRED",
    render: (ctx) => <ModalEquationForensicsAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "multi-mode-interaction", title: "Multi-Mode Interaction Audit", status: "RETIRED",
    render: (ctx) => <MultiModeInteractionAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "modal-transfer-skirt-shape", title: "Modal Transfer Skirt Shape Audit", status: "RETIRED",
    render: (ctx) => <ModalTransferSkirtShapeAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "isolated-modal-transfer-root-cause", title: "Isolated Modal Transfer Root-Cause Audit", status: "RETIRED",
    render: (ctx) => <IsolatedModalTransferRootCauseAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "frequency-scaling-chain", title: "Frequency Scaling Chain Audit", status: "RETIRED",
    render: (ctx) => <FrequencyScalingChainAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "q-transfer-resolution", title: "Q Transfer Resolution Audit", status: "RETIRED",
    render: (ctx) => <QTransferResolutionAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "pressure-assembly", title: "Pressure Assembly Audit", status: "RETIRED",
    render: (ctx) => <PressureAssemblyAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "modal-excitation", title: "Modal Excitation Audit", status: "RETIRED",
    render: (ctx) => <ModalExcitationAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "modal-phase-rotation-ab", title: "Modal Phase Rotation A/B Test", status: "RETIRED",
    render: (ctx) => <ModalPhaseRotationABTest roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "modal-energy-budget", title: "Modal Energy Budget Audit", status: "RETIRED",
    render: (ctx) => <ModalEnergyBudgetAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "source-excitation-reality", title: "Source Excitation Reality Audit", status: "RETIRED",
    render: (ctx) => <SourceExcitationRealityAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "source-curve-root-cause", title: "Source Curve Root-Cause Audit", status: "RETIRED",
    render: (ctx) => <SourceCurveRootCauseAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "source-curve-abc", title: "Source Curve A/B/C Audit", status: "RETIRED",
    render: (ctx) => <SourceCurveABCAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} /> },
  { key: "mode-axis-identity", title: "Mode Axis Identity Audit", status: "RETIRED",
    render: (ctx) => <ModeAxisIdentityAudit /> },
  { key: "axial-phase-sign-parity", title: "Axial Phase Sign Parity Audit", status: "RETIRED",
    render: (ctx) => <AxialPhaseSignParityAudit /> },
  { key: "modal-distance-scaling-ab", title: "Modal Distance Scaling A/B Audit", status: "RETIRED",
    render: (ctx) => <ModalDistanceScalingABAudit /> },
  { key: "image-source-geometry", title: "Image Source Geometry Audit", status: "VERIFIED",
    render: (ctx) => <ImageSourceGeometryAudit /> },

  { key: "image-source-parity-shootout", title: "Image Source Parity Shootout", status: "RETIRED",
    render: (ctx) => (
      <ImageSourceParityShootout
        roomDims={ctx.roomDims}
        seatingPositions={ctx.seatingPositions}
        subsForSimulation={ctx.subsForSimulation}
        surfaceAbsorption={ctx.surfaceAbsorption}
        rewOverlaySeries={ctx.rewOverlaySeries}
        liveProductionData={ctx.multiSeries?.[0]?.data ?? null}
      />
    ) },
  { key: "q-clamp-bypass-ab", title: "Q-Clamp Bypass A/B Test", status: "RETIRED",
    render: (ctx) => <QClampBypassABTest roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} /> },
  { key: "live-modal-contributor", title: "Live Modal Contributor Audit", status: "RETIRED",
    render: (ctx) => <LiveModalContributorAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "live-modal-vector-build", title: "Live Modal Vector Build Panel", status: "RETIRED",
    render: (ctx) => <LiveModalVectorBuildPanel roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "null-recovery-mechanism", title: "Null Recovery Mechanism Audit", status: "RETIRED",
    render: (ctx) => <NullRecoveryMechanismAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "null-vector-decomposition", title: "Null Vector Decomposition Audit", status: "RETIRED",
    render: (ctx) => <NullVectorDecompositionAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "phase-evolution-modal-transfer", title: "Phase Evolution Modal Transfer Audit", status: "RETIRED",
    render: (ctx) => <PhaseEvolutionModalTransferAudit roomDims={ctx.roomDims} seatingPositions={ctx.seatingPositions} subsForSimulation={ctx.subsForSimulation} surfaceAbsorption={ctx.surfaceAbsorption} /> },
  { key: "rew-reference-feature-match", title: "REW Reference Feature Match Audit", status: "RETIRED",
    render: (ctx) => <RewReferenceFeatureMatchAudit /> },
  { key: "lf-reflection-handoff-prototype", title: "LF Reflection Handoff Prototype Benchmark", status: "RETIRED",
    render: (ctx) => <LfReflectionHandoffPrototypeBenchmark /> },
  { key: "freq-dep-q", title: "Frequency-Dependent Q Audit", status: "RETIRED",
    render: (ctx) => (
      <FreqDepQAuditPanel
        roomDims={ctx.roomDims}
        seatingPositions={ctx.seatingPositions}
        subsForSimulation={ctx.subsForSimulation}
        surfaceAbsorption={ctx.surfaceAbsorption}
        rewOverlaySeries={ctx.rewOverlaySeries}
        qStrategy={ctx.qStrategy}
      />
    ) },
  { key: "modal-accumulation-architecture", title: "Modal Accumulation Architecture Audit", status: "RETIRED",
    render: (ctx) => <ModalAccumulationArchitectureAudit /> },
  { key: "front-wall-absorption-sensitivity", title: "Front Wall Absorption Sensitivity Audit", status: "RETIRED",
    render: (ctx) => <FrontWallAbsorptionSensitivityAudit /> },
  { key: "absorption-authority", title: "Absorption Authority Audit", status: "RETIRED",
    render: (ctx) => <AbsorptionAuthorityAudit /> },
  { key: "modal-q-transfer-authority", title: "Modal Q Transfer Authority Audit", status: "RETIRED",
    render: (ctx) => <ModalQTransferAuthorityAudit /> },
  { key: "storage-factor-dominance", title: "Case 027 — Storage Factor Dominance Audit", status: "RETIRED",
    render: (ctx) => <StorageFactorDominanceAudit /> },
  { key: "root-cause-shootout", title: "Case 030 — Root Cause Shootout", status: "RETIRED",
    render: (ctx) => <RootCauseShootoutAudit /> },
  { key: "modal-field-internal-shootout", title: "Case 031 — Modal Field Internal Shootout", status: "RETIRED",
    render: (ctx) => <ModalFieldInternalShootoutAudit /> },
  { key: "modal-phase-receiver-coupling-decision", title: "Case 032 — Modal Phase / Receiver Coupling Decision Test", status: "RETIRED",
    render: (ctx) => <ModalPhaseReceiverCouplingDecisionAudit /> },
  { key: "absorption-authority-root-cause", title: "Case 033 — Absorption Authority Root Cause Audit", status: "RETIRED",
    render: (ctx) => <AbsorptionAuthorityRootCauseAudit /> },
  { key: "case-035-null-cause-isolation", title: "Case 035 — 30 Hz Null Cause Isolation", status: "RETIRED",
    render: (ctx) => <Case035NullCauseIsolationAudit /> },
  { key: "case-036-final-pressure-combination", title: "Case 036 — Final Pressure Combination Audit", status: "RETIRED",
    render: (ctx) => <Case036FinalPressureCombinationAudit /> },
  { key: "case-037-off-resonance-modal-tail", title: "Case 037 — Off-Resonance Modal Tail Audit", status: "RETIRED",
    render: (ctx) => <Case037OffResonanceModalTailAudit /> },
  { key: "case-038-full-30hz-vector-ledger", title: "Case 038 — Full 30 Hz Vector Ledger", status: "RETIRED",
    render: (ctx) => <Case038Full30HzVectorLedger /> },
  { key: "case-039-modal-transfer-phase-function", title: "Case 039 — Modal Transfer Phase Function Audit", status: "RETIRED",
    render: (ctx) => <Case039ModalTransferPhaseFunctionAudit /> },
  { key: "case-040-off-resonance-modal-magnitude-falloff", title: "Case 040 — Off-Resonance Modal Magnitude Falloff Audit", status: "RETIRED",
    render: (ctx) => <Case040OffResonanceModalMagnitudeFalloffAudit /> },
  { key: "case-041-multi-room-modal-source-amplitude-check", title: "Case 041 — Multi-Room Modal Source Amplitude Check", status: "RETIRED",
    render: (ctx) => <Case041MultiRoomModalSourceAmplitudeCheck /> },
  { key: "case-042-resonant-transfer-equation-parity-check", title: "Case 042 — Resonant Transfer Equation Parity Check", status: "RETIRED",
    render: (ctx) => <Case042ResonantTransferEquationParityCheck /> },
  { key: "case-043-source-receiver-coupling-parity-audit", title: "Case 043 — Source / Receiver Coupling Equation Parity Audit",
    render: (ctx) => <Case043SourceReceiverCouplingParityAudit /> },
  { key: "case-044-rew-axis-mapping-final-check", title: "Case 044 — REW Axis Mapping Final Check",
    render: (ctx) => <Case044RewAxisMappingFinalCheck /> },
  { key: "case-045-modal-overlap-weighting-shootout", title: "Case 045 — Modal Overlap Weighting Shootout",
    render: (ctx) => <Case045ModalOverlapWeightingShootoutAudit /> },
  { key: "case-046-modal-contribution-normalisation-shootout", title: "Case 046 — Modal Contribution Normalisation Shootout",
    render: (ctx) => <Case046ModalContributionNormalisationShootoutAudit /> },
  { key: "case-047-five-room-bandwidth-scale-calibration", title: "Case 047 — Five-Room Bandwidth Scale Calibration",
    render: (ctx) => <Case047FiveRoomBandwidthScaleCalibrationAudit /> },
  { key: "case-048-damping-unit-scale-factor-audit", title: "Case 048 — Damping Unit / Scale Factor Audit",
    render: (ctx) => <Case048DampingUnitScaleFactorAudit /> },
  { key: "case-049-source-excitation-model-shootout", title: "Case 049 — Source Excitation Model Shootout",
    render: (ctx) => <Case049SourceExcitationModelShootoutAudit /> },
  { key: "case-050-complex-summation-integrity-audit", title: "Case 050 — Complex Summation Integrity Audit",
    render: (ctx) => <Case050ComplexSummationIntegrityAudit /> },
  { key: "case-051-textbook-analytical-solver-cross-check", title: "Case 051 — Textbook Analytical Solver Cross-Check",
    render: (ctx) => <Case051TextbookAnalyticalSolverCrossCheckAudit /> },
  { key: "case-052-seat-position-null-alignment", title: "Case 052 — Seat-Position Null Alignment Test",
    render: (ctx) => <Case052SeatPositionNullAlignmentAudit /> },
  { key: "case-053-listener-coordinate-verification", title: "Case 053 — Listener Coordinate Verification",
    render: (ctx) => <Case053ListenerCoordinateVerificationAudit /> },
  { key: "case-054-modal-phase-validation", title: "Case 054 — Modal Phase Validation",
    render: (ctx) => <Case054ModalPhaseValidationAudit /> },
  { key: "case-055-modal-eigenfunction-spatial-basis", title: "Case 055 — Modal Eigenfunction Spatial Basis Audit",
    render: (ctx) => <Case055ModalEigenfunctionSpatialBasisAudit /> },
  { key: "case-056-direct-reflection-path-validation", title: "Case 056 — Direct / Reflection Path Validation",
    render: (ctx) => <Case056DirectReflectionPathValidationAudit /> },
];

const BASE_TIMESTAMP_MS = new Date("2026-07-04T09:00:00Z").getTime();
const INTERVAL_HOURS = 30;

export function buildInvestigationManifest(ctx) {
  const total = RAW_ENTRIES.length;
  return RAW_ENTRIES.map((entry, index) => {
    const isNewest = index === total - 1;
    const status = entry.status || (isNewest ? "ACTIVE" : "RETIRED");
    const timestampMs = BASE_TIMESTAMP_MS - (total - 1 - index) * INTERVAL_HOURS * 3600 * 1000;
    return {
      key: entry.key,
      title: entry.title,
      status,
      timestamp: new Date(timestampMs).toISOString(),
      render: () => entry.render(ctx),
    };
  });
}