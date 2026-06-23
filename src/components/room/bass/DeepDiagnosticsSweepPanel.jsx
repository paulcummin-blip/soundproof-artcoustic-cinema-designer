/**
 * DeepDiagnosticsSweepPanel — Diagnostic only.
 * Extracted from BassResponse.jsx to keep that file under the 2500-line limit.
 * All props are pass-through from BassResponse; no logic lives here.
 */
import React from 'react';
import RewParityTangentialSweep from "@/components/room/bass/RewParityTangentialSweep";
import RewParityQSweep from "@/components/room/bass/RewParityQSweep";
import RewParityQTangentialSweep from "@/components/room/bass/RewParityQTangentialSweep";
import RewParity80HzAudit from "@/components/room/bass/RewParity80HzAudit";
import ModalBandwidthDiagnostic from "@/components/room/bass/ModalBandwidthDiagnostic";
import DominantModeRootCauseAudit from "@/components/room/bass/DominantModeRootCauseAudit";
import DominantModeTransferAudit from "@/components/room/bass/DominantModeTransferAudit";
import TransferMagnitudeSanityAudit from "@/components/room/bass/TransferMagnitudeSanityAudit";
import ModalPressureAudit from "@/components/room/bass/ModalPressureAudit";
import DirectModalEnergyAudit from "@/components/room/bass/DirectModalEnergyAudit";
import FinalSplReconstructionAudit from "@/components/room/bass/FinalSplReconstructionAudit";
import ModalGainSweep from "@/components/room/bass/ModalGainSweep";
import ModalSourceModelSweep from "@/components/room/bass/ModalSourceModelSweep";
import OffResonanceTransferAudit from "@/components/room/bass/OffResonanceTransferAudit";
import ModeShapeAudit from "@/components/room/bass/ModeShapeAudit";
import SubPositionParitySensitivityAudit from "@/components/room/bass/SubPositionParitySensitivityAudit";
import ModalCoherenceSweepAudit from "@/components/room/bass/ModalCoherenceSweepAudit";
import FamilyEnergyBreakdownAudit from "@/components/room/bass/FamilyEnergyBreakdownAudit";
import TangentialScaleSweepAudit from "@/components/room/bass/TangentialScaleSweepAudit";
import SourceCoherenceMatrixAudit from "@/components/room/bass/SourceCoherenceMatrixAudit";
import FamilyCoherenceInterpolationAudit from "@/components/room/bass/FamilyCoherenceInterpolationAudit";
import ModalOrderLimitAudit from "@/components/room/bass/ModalOrderLimitAudit";
import ModalContributionHistogram from "@/components/room/bass/ModalContributionHistogram";
import HighOrderSuppressionSweep from "@/components/room/bass/HighOrderSuppressionSweep";
import CombinedBestFitAudit from "@/components/room/bass/CombinedBestFitAudit";
import ParityRootCauseMatrixAudit from "@/components/room/bass/ParityRootCauseMatrixAudit";
import GlobalEnergyCalibrationAudit from "@/components/room/bass/GlobalEnergyCalibrationAudit";
import DirectFieldDecompositionAudit from "@/components/room/bass/DirectFieldDecompositionAudit";
import DirectReferenceLevelSweepAudit from "@/components/room/bass/DirectReferenceLevelSweepAudit";
import ReferenceTraceAudit from "@/components/room/bass/ReferenceTraceAudit";
import ModalDensityAudit from "@/components/room/bass/ModalDensityAudit";
import SourceReferenceProvenanceAudit from "@/components/room/bass/SourceReferenceProvenanceAudit";
import RemainingSuspectsMatrixAudit from "@/components/room/bass/RemainingSuspectsMatrixAudit";
import DirectModalEnergyRatioAudit from "@/components/room/bass/DirectModalEnergyRatioAudit";
import ModalGainProvenanceAudit from "@/components/room/bass/ModalGainProvenanceAudit";
import DirectModalRatioValidationAudit from "@/components/room/bass/DirectModalRatioValidationAudit";
import ModalSourceAmplitudeProvenanceAudit from "@/components/room/bass/ModalSourceAmplitudeProvenanceAudit";
import TransferFunctionShapeAudit from "@/components/room/bass/TransferFunctionShapeAudit";
import TransferFunctionFormulaAudit from "@/components/room/bass/TransferFunctionFormulaAudit";

export default function DeepDiagnosticsSweepPanel({
  roomDims,
  sweepSeat,
  sweepSub,
  subs,
  surfaceAbsorption,
  sweepSettings,
  simulationResults,
  multiSeries,
  axialQ,
  modalDistanceBlend,
}) {
  return (
    <>
      <RewParityTangentialSweep roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <RewParityQSweep roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <RewParityQTangentialSweep roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <RewParity80HzAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <ModalBandwidthDiagnostic roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <DominantModeRootCauseAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <DominantModeTransferAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <TransferMagnitudeSanityAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <ModalPressureAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <DirectModalEnergyAudit
        roomDims={roomDims} seat={sweepSeat} sub={sweepSub}
        surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings}
        graphSeries={multiSeries[0]?.data ?? []}
      />
      <FinalSplReconstructionAudit
        simulationResults={simulationResults}
        selectedSeatId={sweepSeat ? (sweepSeat.id || `${sweepSeat.x}-${sweepSeat.y}`) : null}
        graphSeries={multiSeries[0]?.data ?? []}
      />
      <ModalGainSweep roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} />
      <ModalSourceModelSweep roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} />
      <OffResonanceTransferAudit roomDims={roomDims} surfaceAbsorption={surfaceAbsorption} />
      <ModeShapeAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <SubPositionParitySensitivityAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <ModalCoherenceSweepAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <FamilyEnergyBreakdownAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <TangentialScaleSweepAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <SourceCoherenceMatrixAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <FamilyCoherenceInterpolationAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <ModalOrderLimitAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <ModalContributionHistogram roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <HighOrderSuppressionSweep roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} />
      <CombinedBestFitAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} axialQ={axialQ} />
      <ParityRootCauseMatrixAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} axialQ={axialQ} distanceBlend={modalDistanceBlend} />
      <GlobalEnergyCalibrationAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} axialQ={axialQ} distanceBlend={modalDistanceBlend} />
      <DirectFieldDecompositionAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} axialQ={axialQ} distanceBlend={modalDistanceBlend} />
      <DirectReferenceLevelSweepAudit roomDims={roomDims} subs={subs} seat={sweepSeat} surfaceAbsorption={surfaceAbsorption} axialQ={axialQ} distanceBlend={modalDistanceBlend} />
      <ReferenceTraceAudit simulationResults={simulationResults} graphSeries={multiSeries[0]?.data ?? []} subs={subs} seat={sweepSeat} />
      <ModalDensityAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <SourceReferenceProvenanceAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <RemainingSuspectsMatrixAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <DirectModalEnergyRatioAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <ModalGainProvenanceAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <DirectModalRatioValidationAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <ModalSourceAmplitudeProvenanceAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <TransferFunctionShapeAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
      <TransferFunctionFormulaAudit roomDims={roomDims} seat={sweepSeat} sub={sweepSub} surfaceAbsorption={surfaceAbsorption} activeSettings={sweepSettings} />
    </>
  );
}