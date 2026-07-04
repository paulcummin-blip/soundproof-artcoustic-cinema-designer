// TemporaryBassAuditPanels.jsx
// Extracted from BassDiagnosticsPanel.jsx (no behaviour/physics/graph changes) to keep
// that file under the line-count guideline. Renders the always-visible temporary
// diagnostic audit panels for the Bass Response page, in the same order as before.

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

export default function TemporaryBassAuditPanels({
  roomDims, seatingPositions, subsForSimulation, surfaceAbsorption,
  rewOverlaySeries, multiSeries, qStrategy,
}) {
  return (
    <>
      <ImageSourceParityShootout
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
        rewOverlaySeries={rewOverlaySeries}
        liveProductionData={multiSeries[0]?.data ?? null}
      />
      <QClampBypassABTest roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} />
      <LiveModalContributorAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <LiveModalVectorBuildPanel roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <NullRecoveryMechanismAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <NullVectorDecompositionAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <LiveVectorGeometryAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <PhaseEvolutionModalTransferAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ProjectionMathematicsAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <DominantModeConstructionAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <RewTransferFunctionParityAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ModalPhysicsInputAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ModalEquationForensicsAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <MultiModeInteractionAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ModalTransferSkirtShapeAudit roomDims={roomDims} seatingPositions={seatingPositions} surfaceAbsorption={surfaceAbsorption} />
      <IsolatedModalTransferRootCauseAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <FrequencyScalingChainAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <QTransferResolutionAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <PressureAssemblyAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ModalExcitationAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ModalPhaseRotationABTest roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ModalEnergyBudgetAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <SourceExcitationRealityAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <SourceCurveRootCauseAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <SourceCurveABCAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} />
      <ModeAxisIdentityAudit />
      <AxialPhaseSignParityAudit />
      <DirectModalVectorBalanceAudit />
      <ReflectionModalDoubleCountingAudit />
      <ReflectionVectorPhaseTraceAudit />
      <ReflectionOrderContributionAudit />
      <SchroederHandoffABAudit />
      <RewReferenceFeatureMatchAudit />
      <LfReflectionHandoffPrototypeBenchmark />
      <ReflectionInjectionLocationAudit />
      <FreqDepQAuditPanel
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
        rewOverlaySeries={rewOverlaySeries}
        qStrategy={qStrategy}
      />
      <ModalTransferConstructionAudit roomDims={roomDims} seatingPositions={seatingPositions} subsForSimulation={subsForSimulation} surfaceAbsorption={surfaceAbsorption} />
      <ModalDistanceScalingABAudit />
      <ImageSourceGeometryAudit />
      <ModalAccumulationArchitectureAudit />
    </>
  );
}