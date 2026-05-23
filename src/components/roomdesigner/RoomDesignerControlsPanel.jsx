import React, { Suspense, useState } from "react";
import { Ruler, Monitor, Users, Speaker, Waves, Box, FileText } from "lucide-react";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import SpeakerPositionsReadout from "@/components/room/SpeakerPositionsReadout";
import RP22CompliancePanel from "@/components/rp22/RP22CompliancePanel";
import OptionsPanel from "@/components/roomdesigner/OptionsPanel";

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

const VIEW_BUTTONS = [['controls', 'CONTROLS'], ['isometric', 'ISOMETRIC'], ['data', 'DATA']];

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
  difficultyMultiplier,
  setDifficultyMultiplier,
  priceData,
  _frontSubsCfg,
  _rearSubsCfg,
}) {
  const [rightPanelView, setRightPanelView] = useState('controls');

  return (
    <aside className="relative z-30" style={{ minWidth: 0, minHeight: 0 }}>
      {/* Right panel view selector bar */}
      <div style={{ display: 'flex', gap: 2, padding: '6px 10px', borderBottom: '1px solid #DCDBD6', background: '#fff' }}>
        {VIEW_BUTTONS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRightPanelView(key)}
            style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 6, border: rightPanelView === key ? '1px solid #213428' : '1px solid transparent', background: rightPanelView === key ? '#213428' : 'transparent', color: rightPanelView === key ? '#fff' : '#625143', cursor: 'pointer', transition: 'all 0.15s' }}
          >
            {label}
          </button>
        ))}
      </div>

      {rightPanelView === 'isometric' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 196px)', color: '#625143', fontSize: 14, fontWeight: 500 }}>
          Isometric view coming next
        </div>
      )}

      {rightPanelView === 'data' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 196px)', color: '#625143', fontSize: 14, fontWeight: 500 }}>
          Live data dashboard coming next
        </div>
      )}

      {rightPanelView === 'controls' && <div
        style={{ height: "calc(100vh - 196px)", overflow: "auto", paddingRight: 8 }}
        className="space-y-3">

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
              disabled={isFrozen('dimensions')} />
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
              onRowEarHeightsChange={appState?.setRowEarHeights} />
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

            <div className="px-4 py-3 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Speaker Positions</div>
                <select
                  value={speakerPositionsView}
                  onChange={(e) => setSpeakerPositionsView(e.target.value)}
                  className="text-xs px-2 py-1 border border-gray-300 rounded">
                  <option value="off">Off</option>
                  <option value="plan">Plan</option>
                  <option value="table">Table</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>

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
              p15ConstructionLevel={appState?.p15ConstructionLevel}
              p21EarlyReflectionPreset={appState?.p21EarlyReflectionPreset}
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
            difficultyMultiplier={difficultyMultiplier}
            setDifficultyMultiplier={setDifficultyMultiplier}
            priceData={priceData}
            placedSpeakers={placedSpeakers}
            frontSubsCfg={_frontSubsCfg}
            rearSubsCfg={_rearSubsCfg}
          />
        </CollapsiblePanel>
      </div>}
    </aside>
  );
}