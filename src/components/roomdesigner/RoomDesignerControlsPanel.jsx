import React, { Suspense } from "react";
import { Ruler, Monitor, Users, Speaker, Waves, Box, FileText } from "lucide-react";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import SpeakerPositionsReadout from "@/components/room/SpeakerPositionsReadout";
import RP22CompliancePanel from "@/components/rp22/RP22CompliancePanel";
import OptionsPanel from "@/components/roomdesigner/OptionsPanel";
import ViewModeToggle from "@/components/roomdesigner/ViewModeToggle";

const RoomDimensions = React.lazy(() =>
  import("@/components/room/RoomDimensions").then((m) => ({ default: m.default ?? m.RoomDimensions }))
);
const ScreenConfiguration = React.lazy(() =>
  import("@/components/room/ScreenConfiguration").then((m) => ({ default: m.default ?? m.ScreenConfiguration }))
);
const SeatingLayout = React.lazy(() =>
  import("@/components/room/SeatingLayout").then((m) => ({ default: m.default ?? m.SeatingLayout }))
);
const SpeakerPlacement = React.lazy(() =>
  import("@/components/room/SpeakerPlacement").then((m) => ({ default: m.default ?? m.SpeakerPlacement }))
);
const RoomElements = React.lazy(() =>
  import("@/components/room/RoomElements").then((m) => ({ default: m.default ?? m.RoomElements }))
);
const BassResponse = React.lazy(() =>
  import("@/components/room/BassResponse").then((m) => ({ default: m.default ?? m.BassResponse }))
);

export default function RoomDesignerControlsPanel({
  appState,
  isFrozen,
  // Room dims
  _roomDims,
  _setRoomDims,
  // Room elements
  roomElements,
  setRoomElementsGuarded,
  // Screen
  stableDimensions,
  _screen,
  setScreenGuarded,
  seatingPositions,
  dolbyPreset,
  // Seating
  handleGenerateSeating,
  _seatsPerRowByRow,
  setSeatsPerRowByRowGuarded,
  seatsPerRow,
  setSeatsPerRowGuarded,
  seatingRows,
  setSeatingRowsGuarded,
  seatSpacing,
  setSeatSpacingGuarded,
  _rowSpacingM,
  setRowSpacingGuarded,
  _seatingBlockOffset,
  setSeatingBlockOffsetGuarded,
  seatingArrangementBasis,
  setSeatingArrangementBasis,
  visualisationRef,
  showMlpRuler,
  setShowMlpRuler,
  // Speakers
  _sevenBedLayoutType,
  setSevenBedLayoutType,
  setDolbyPreset,
  lcrAimMode,
  setLcrAimMode,
  lcrAngleDeg,
  overheadGlobalModelFromState,
  setOverheadGlobalModelFromState,
  overheadFrontOverrideFromState,
  setOverheadFrontOverrideFromState,
  overheadMidOverrideFromState,
  setOverheadMidOverrideFromState,
  overheadRearOverrideFromState,
  setOverheadRearOverrideFromState,
  useFrontGlobalFromState,
  setUseFrontGlobalFromState,
  useMidGlobalFromState,
  setUseMidGlobalFromState,
  useRearGlobalFromState,
  setUseRearGlobalFromState,
  allSeatSplMetrics,
  updateGlobalSplWithProjectSync,
  frontWideZones,
  isNineBedLayout,
  speakerPositionsView,
  setSpeakerPositionsView,
  placedSpeakers,
  _seatingPositions,
  // Bass
  frontSubsCfg,
  setFrontSubsCfg,
  rearSubsCfg,
  setRearSubsCfg,
  subWarnings,
  frontSubsForRendering,
  rearSubsForRendering,
  // Report
  analysisResult,
  freeMoveLcr,
  // Options
  showPrices,
  setShowPrices,
  showAsdr,
  setShowAsdr,
  difficultyMultiplier,
  setDifficultyMultiplier,
  priceData,
  priceMode,
  setPriceMode,
  manualExtras,
  setManualExtras,
  soundbarSelections,
  setSoundbarSelections,
  _frontSubsCfg,
  _rearSubsCfg,
  // RSP mode
  rspMode,
  onRspModeChange,
  manualRspX_m,
  onManualRspX_mChange,
  manualRspY_m,
  onManualRspY_mChange,
  // Designated RSP seat (seat_bound mode)
  designatedRspSeatId,
  onSetDesignatedRspSeatId,
  // Viewing priority
  viewingPriority,
  onViewingPriorityChange,
  // Link ear & platform heights
  linkEarPlatformHeights,
  onLinkEarPlatformHeightsChange,
  // Acoustic treatment
  acousticTreatmentEnabled,
  setAcousticTreatmentEnabled,
  selectedAbfuserQty,
  setSelectedAbfuserQty,
  recommendedAbfuserQty,
  // Workspace view mode (moved here from header)
  viewMode,
  onViewModeChange,
}) {
  return (
    <aside className="relative z-30" style={{ minWidth: 0, minHeight: 0 }}>
      <div
        style={{ height: "calc(100vh - 196px)", overflow: "auto", paddingRight: 8 }}
        className="space-y-3">

        {/* Workspace view selector — controls how the workspace is displayed.
            Moved here from the header so it sits with the design controls. */}
        <div className="px-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#625143] mb-1.5">
            Workspace View
          </div>
          <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
        </div>

        <CollapsiblePanel
          title="Room Dimensions"
          icon={<Ruler className="w-5 h-5" />}
          defaultOpen={true}>
          {isFrozen('dimensions') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <RoomDimensions
              width_m={_roomDims?.widthM}
              length_m={_roomDims?.lengthM}
              height_m={_roomDims?.heightM}
              onChange={(partial) => {
                if (!isFrozen('dimensions') && _setRoomDims) {
                  _setRoomDims((prev) => ({ ...prev, ...partial }));
                }
              }}
              disabled={isFrozen('dimensions')}
              speakerPositionsView={speakerPositionsView}
              onSpeakerPositionsViewChange={setSpeakerPositionsView} />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Room Elements"
          icon={<Box className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('elements') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <RoomElements
              elements={roomElements}
              onChange={setRoomElementsGuarded}
              disabled={isFrozen('elements')}
              roomDims={appState?.roomDims}
            />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Screen Size"
          icon={<Monitor className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('screen') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <ScreenConfiguration
              dimensions={stableDimensions}
              screen={_screen}
              onScreenChange={setScreenGuarded}
              seatingPositions={seatingPositions}
              dolbyConfig={dolbyPreset}
              disabled={isFrozen('screen')} />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Seating Layout"
          icon={<Users className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('seating') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <SeatingLayout
              seatingPositions={seatingPositions}
              onGenerateSeating={handleGenerateSeating}
              seatsPerRowByRow={_seatsPerRowByRow}
              onSeatsPerRowByRowChange={setSeatsPerRowByRowGuarded}
              seatsPerRow={seatsPerRow}
              onSeatsPerRowChange={setSeatsPerRowGuarded}
              seatingRows={seatingRows}
              onSeatingRowsChange={setSeatingRowsGuarded}
              seatSpacing={seatSpacing}
              onSeatSpacingChange={setSeatSpacingGuarded}
              rowSpacingM={_rowSpacingM || 1.8}
              rowCentersM={appState?.rowCentersM || []}
              onRowSpacingChange={(val) => {
                const next = Number(val);
                if (!Number.isFinite(next)) return;
                if (typeof setRowSpacingGuarded === 'function') {
                  setRowSpacingGuarded(next);
                }
              }}
              seatingBlockOffset={_seatingBlockOffset}
              onSeatingBlockOffsetChange={setSeatingBlockOffsetGuarded}
              mlpBasis={seatingArrangementBasis}
              onMlpBasisChange={setSeatingArrangementBasis}
              onSetSeatingPositions={appState?.setSeatingPositions}
              disabled={isFrozen('seating')}
              screen={_screen}
              dimensions={stableDimensions}
              shiftSeatsToMaintainAngle={visualisationRef.current?.shiftSeatsToMaintainAngle}
              showMlpRuler={showMlpRuler}
              onShowMlpRulerChange={setShowMlpRuler}
              rowEarHeights={appState?.rowEarHeights || []}
              onRowEarHeightsChange={appState?.setRowEarHeights}
              rspMode={rspMode}
              onRspModeChange={onRspModeChange}
              manualRspX_m={manualRspX_m}
              onManualRspX_mChange={onManualRspX_mChange}
              manualRspY_m={manualRspY_m}
              onManualRspY_mChange={onManualRspY_mChange}
              designatedRspSeatId={designatedRspSeatId}
              onSetDesignatedRspSeatId={onSetDesignatedRspSeatId}
              viewingPriority={viewingPriority}
              onViewingPriorityChange={onViewingPriorityChange}
              linkEarPlatformHeights={linkEarPlatformHeights}
              onLinkEarPlatformHeightsChange={onLinkEarPlatformHeightsChange} />
          </Suspense>
        </CollapsiblePanel>

        <div className="mb-6">
          <CollapsiblePanel
            title="Speakers"
            icon={<Speaker className="w-5 h-5" />}
            defaultOpen={false}>
            {isFrozen('speakers') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                This tab is frozen. Unlock to make changes.
              </div>
            }
            <Suspense fallback={<div>Loading...</div>}>
              <SpeakerPlacement
                disabled={isFrozen('speakers')}
                dimensions={stableDimensions}
                sevenBedLayoutType={_sevenBedLayoutType}
                onSevenBedLayoutTypeChange={setSevenBedLayoutType}
                dolbyPreset={dolbyPreset}
                onDolbyPresetChange={setDolbyPreset}
                lcrAimMode={lcrAimMode}
                onChangeLcrAimMode={setLcrAimMode}
                lcrAngleDeg={lcrAngleDeg}
                overheadGlobalModel={overheadGlobalModelFromState}
                setOverheadGlobalModel={setOverheadGlobalModelFromState}
                overheadFrontOverride={overheadFrontOverrideFromState}
                setOverheadFrontOverride={setOverheadFrontOverrideFromState}
                overheadMidOverride={overheadMidOverrideFromState}
                setOverheadMidOverride={setOverheadMidOverrideFromState}
                overheadRearOverride={overheadRearOverrideFromState}
                setOverheadRearOverride={setOverheadRearOverrideFromState}
                useFrontGlobal={useFrontGlobalFromState}
                setUseFrontGlobal={setUseFrontGlobalFromState}
                useMidGlobal={useMidGlobalFromState}
                setUseMidGlobal={setUseMidGlobalFromState}
                useRearGlobal={useRearGlobalFromState}
                setUseRearGlobal={setUseRearGlobalFromState}
                globalSurroundModel={appState?.globalSurroundModel}
                setGlobalSurroundModel={appState?.setGlobalSurroundModel}
                allSeatSplMetrics={allSeatSplMetrics}
                updateGlobalSpl={updateGlobalSplWithProjectSync}
                frontWideOverlay={frontWideZones}
                allowExtraSurrounds={isNineBedLayout}
                extraSurroundCount={isNineBedLayout ? (appState?.extraSurroundCount ?? 0) : 0}
                onExtraSurroundCountChange={isNineBedLayout ? appState?.setExtraSurroundCount : undefined}
                onP12Update={undefined} />
            </Suspense>

            <SpeakerPositionsReadout
              placedSpeakers={placedSpeakers}
              seatingPositions={_seatingPositions}
              roomWidth={stableDimensions.width}
              roomLength={stableDimensions.length}
              screenFrontPlaneM={appState?.screenFrontPlaneM}
              view={speakerPositionsView} />
          </CollapsiblePanel>
        </div>

        <CollapsiblePanel
          title="Bass Simulation"
          icon={<Waves className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('bass') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <BassResponse
              disabled={isFrozen('bass')}
              frontSubsCfg={frontSubsCfg}
              setFrontSubsCfg={setFrontSubsCfg}
              rearSubsCfg={rearSubsCfg}
              setRearSubsCfg={setRearSubsCfg}
              subWarnings={subWarnings}
              frontSubsLive={frontSubsForRendering}
              rearSubsLive={rearSubsForRendering} />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Compliance Report"
          icon={<FileText className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('report') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <RP22CompliancePanel
              analysisResult={analysisResult}
              screen={_screen}
              seatingPositions={_seatingPositions}
              seatHudSnapshots={
                (appState?.seatSnapshotBySeatId && Object.keys(appState.seatSnapshotBySeatId).length > 0)
                  ? appState.seatSnapshotBySeatId
                  : ((appState?.seatMetricsById && Object.keys(appState.seatMetricsById).length > 0)
                      ? appState.seatMetricsById
                      : {})
              }
              roomHudSnapshot={appState?.roomHudSnapshot || analysisResult?.roomHudSnapshot || null}
              mlpSeatId={"mlp"}
              dolbyLayout={appState?.dolbyLayout}
              frontSubsCount={appState?.frontSubsCfg?.count}
              rearSubsCount={appState?.rearSubsCfg?.count}
              assumedP15Level={appState?.assumedP15Level}
              assumedP21Level={appState?.assumedP21Level}
              freeMoveLcr={freeMoveLcr} />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Options"
          icon={<Box className="w-5 h-5" />}
          defaultOpen={false}>
          <OptionsPanel
            showPrices={showPrices}
            setShowPrices={setShowPrices}
            showAsdr={showAsdr}
            setShowAsdr={setShowAsdr}
            difficultyMultiplier={difficultyMultiplier}
            setDifficultyMultiplier={setDifficultyMultiplier}
            priceData={priceData}
            priceMode={priceMode}
            setPriceMode={setPriceMode}
            manualExtras={manualExtras}
            setManualExtras={setManualExtras}
            soundbarSelections={soundbarSelections}
            setSoundbarSelections={setSoundbarSelections}
            acousticTreatmentEnabled={acousticTreatmentEnabled}
            setAcousticTreatmentEnabled={setAcousticTreatmentEnabled}
            selectedAbfuserQty={selectedAbfuserQty}
            setSelectedAbfuserQty={setSelectedAbfuserQty}
            recommendedAbfuserQty={recommendedAbfuserQty}
          />
        </CollapsiblePanel>
      </div>
    </aside>
  );
}