import React, { useMemo } from "react";
import { hasPos } from "@/components/room/rv/RenderPrimitives";
import RvSpeakerLayer from "@/components/room/rv/render/RvSpeakerLayer";
import SvgDefs from "@/components/room/SvgDefs";
import RvZoomGroup from "@/components/room/rv/render/RvZoomGroup";
import RvRoomBaseLayers from "@/components/room/rv/render/RvRoomBaseLayers";
import RvBaffleAndScreen from "@/components/room/rv/render/RvBaffleAndScreen";
import RvZonesAndOverlays from "@/components/room/rv/render/RvZonesAndOverlays";
import RvDolbyZones from "@/components/room/rv/render/RvDolbyZones";
import RvModalZonesOverlay from "@/components/room/rv/render/RvModalZonesOverlay";
import RvRoomElementsLayer from "@/components/room/rv/render/RvRoomElementsLayer";
import RvMlpRuler from "@/components/room/rv/render/RvMlpRuler";
import RvRp22AnglesOverlay from "@/components/room/rv/render/RvRp22AnglesOverlay";
import SpeakerPositionsOverlay from "@/components/room/overlays/SpeakerPositionsOverlay";
import RvSeatLayer from "@/components/room/rv/render/RvSeatLayer";
import PlanMessages from "@/components/room/PlanMessages";
import RvSeatHudLayer from "@/components/room/rv/render/RvSeatHudLayer";
import RvSpeakerTooltip from "@/components/room/rv/render/RvSpeakerTooltip";
import SeatingDragImpactCard from "@/components/room/SeatingDragImpactCard";
import RvRoomElementDragDims from "@/components/room/rv/render/RvRoomElementDragDims";
import RvMlpDragDims from "@/components/room/rv/render/RvMlpDragDims";

export default function RvPlanCanvas({
  svgRef,
  planBoundsRef,
  rvWrapRef,
  aspect,
  zoomMode,
  handlePlanClick,
  lastPointerRef,
  canvasStyle,
  svgWSafe,
  svgHSafe,
  idsGrid,
  idsClip,
  ids,
  scale,
  svgW,
  svgH,
  handleMouseMove,
  handleMouseUp,
  roomRect,
  placedSpeakers,
  getCanonicalRole,
  dolbyLayout,
  onPanPointerDown,
  onPanPointerMove,
  onPanPointerUp,
  isPanningRef,
  zoom,
  panX,
  panY,
  viewOffsetPx,
  widthM,
  lengthM,
  heightM,
  meterToCanvasX,
  meterToCanvasY,
  toPx,
  exportMode,
  speakerPositionsView,
  overlaysForRendering,
  SPEAKER_PLAN_SIDE_GUTTER_PX,
  TOP_GUTTER_PX,
  SPEAKER_PLAN_TOP_GUTTER_PX,
  BOTTOM_GUTTER_PX,
  SPEAKER_PLAN_BOTTOM_GUTTER_PX,
  screen,
  actualScreenFrontY,
  showBaffle,
  showScreen,
  SCREEN_THICKNESS_M,
  screenFrontPlaneM,
  screenPlaneMode,
  mlp,
  mlpPoint,
  seatingPositions,
  augmentedZones,
  getModelDimsM,
  WALL_BUFFER_M,

  overheadZones,
  dragging,
  draggedItemId,
  frontWideZones,
  hasRoomRect,
  ZoneComponents,
  getDolbyZoneSpecs,
  arcPathForBand,
  roomElements,
  getSpeakerVisibility,
  appState,
  rolesForLayout,
  showMlpRuler,

  draftFrontSubsRef,
  draftRearSubsRef,
  frontSubs,
  rearSubs,
  frontSubsCfg,
  rearSubsCfg,
  showRoomModesOverlay,
  showThrowDistance,
  handleMouseDown,

  rowFrontWallLabelSeatIds,
  rowDistanceLabelSeatIds,
  _overlays,
  hudPinnedSeatId,
  handleSeatMouseEnter,
  handleSeatMouseLeave,
  handleSeatClick,
  clampMlpY,
  MLPMarker,
  overheadIconElements,
  effectiveHoveredSeat,
  visiblePlanSpeakers,
  floorDeg,
  dragWarning,
  tooltip,
  hoveredSpeaker,

  tooltipData,
  hudDynamicStyle,
  onHudHeaderMouseDown,
  hudElRef,
  setHudHiddenWhenPinned,
  hudHiddenWhenPinned,
  renderLevelBadge,
  isHudPinned,
  speakerTooltip,
  hudPosition,  // canvas-pixel position of the HUD card (hudBasePosPx from parent)
  subDragTick,  // incremented on every sub draft update — forces re-read of draft refs
  lastValidDraftFrontSubs,
  lastValidDraftRearSubs,
  // Speaker layer props
  aimAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  lcrAngleInfo,
  bedLayerSpeakerMouseDownHandler,
  onSpeakerAimToggle,
  handleIconEnter,
  handleIconMove,
  handleIconLeave,
  dragImpact,
  onAcceptBaseline,
  onDismissCard,
  isPostDrag = false,
  roomElementDragInfo,
  mlpDragInfo,
  dragType,
  isSeatSnapping = false,
  liveImpactMode = "summary",
}) {
  // Hoisted here (component body) so useMemo follows Rules of Hooks.
  // subDragTick is a dependency so every drag tick forces re-read of the mutated draft refs.
  // Three-tier priority: active draft > held last-valid draft > committed state
  const frontLive = useMemo(() => {
    let subs;
    if (dragging && Array.isArray(draftFrontSubsRef.current)) {
      subs = draftFrontSubsRef.current;
    } else if (lastValidDraftFrontSubs) {
      // Hold the last valid draft position until useSubwooferSync has caught up
      // (cleared by areSubsEffectivelyEqual in RoomVisualisation once frontSubs matches)
      subs = lastValidDraftFrontSubs;
    } else if (Array.isArray(frontSubs) && frontSubs.length > 0) {
      subs = frontSubs;
    } else {
      subs = frontSubs;
    }
    // Enrich with model and orientation from frontSubsCfg
    return Array.isArray(subs) ? subs.map(sub => ({
      ...sub,
      model: frontSubsCfg?.model,
      orientation: frontSubsCfg?.orientation ?? "vertical"
    })) : subs;
  }, [dragging, draftFrontSubsRef, lastValidDraftFrontSubs, frontSubs, frontSubsCfg, subDragTick]);

  const rearLive = useMemo(() => {
    let subs;
    if (dragging && Array.isArray(draftRearSubsRef.current)) {
      subs = draftRearSubsRef.current;
    } else if (lastValidDraftRearSubs) {
      // Hold the last valid draft position until useSubwooferSync has caught up
      subs = lastValidDraftRearSubs;
    } else if (Array.isArray(rearSubs) && rearSubs.length > 0) {
      subs = rearSubs;
    } else {
      subs = rearSubs;
    }
    // Enrich with model and orientation from rearSubsCfg
    return Array.isArray(subs) ? subs.map(sub => ({
      ...sub,
      model: rearSubsCfg?.model,
      orientation: rearSubsCfg?.orientation ?? "vertical"
    })) : subs;
  }, [dragging, draftRearSubsRef, lastValidDraftRearSubs, rearSubs, rearSubsCfg, subDragTick]);

  return (
    <div
      ref={(el) => {
        planBoundsRef.current = el;
        rvWrapRef.current = el;
      }}
      className="relative w-full h-full overflow-auto bg-gray-50"
      style={{
        aspectRatio: aspect,
        border: '1px solid #DCDBD6',
        borderRadius: '0px',
        backgroundColor: '#F8F8F7',
        cursor: zoomMode === 'in' ? 'zoom-in' : zoomMode === 'out' ? 'zoom-out' : 'default',
      }}
      onMouseMove={(e) => {
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 1) {
          lastPointerRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }}
      onClick={handlePlanClick}
    >
      {/* Toolbar has been moved to the parent component's accordion */}

      {/* CANVAS WRAPPER (no tailwind) */}
      <div style={canvasStyle}>

        {/* ROOT SVG */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWSafe} ${svgHSafe}`}
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="geometricPrecision"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            background: '#F8F8F7',
            maxWidth: '100%',
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1,
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >

          {!roomRect || !Number.isFinite(scale) ? (
            <text x="50%" y="50%" textAnchor="middle" fill="#777" fontSize="12">
              Loading plan…
            </text>
          ) : (
            <>
          {/* TEMP DEBUG: Surround Hydration State */}
          {globalThis.__B44_DEBUG_UI === true && (() => {
            const targets = ["SBL", "SBR", "LW", "RW"];
            const status = targets.map(role => {
              const spk = (placedSpeakers || []).find(s => getCanonicalRole(s?.role) === role);
              const exists = !!spk;
              const posValid = spk?.position && Number.isFinite(spk.position.x) && Number.isFinite(spk.position.y);
              const rawRole = spk?.role || "—";
              return `${role}: ${exists ? "yes" : "no"} pos:${posValid ? "yes" : "no"}${rawRole !== role ? ` (${rawRole})` : ""}`;
            }).join(" | ");
            
            return (
              <text
                x="12"
                y="36"
                fontSize="11"
                fill="#0066CC"
                fontFamily="monospace"
                style={{ pointerEvents: "none" }}
              >
                {dolbyLayout} → {status}
              </text>
            );
          })()}

          <SvgDefs ids={ids} scale={scale} svgW={svgW} svgH={svgH} />

          {/* ZOOM GROUP — CLIPPED TO VIEWPORT, WITH ZOOM-TO-CURSOR */}
          <RvZoomGroup
            idsClip={idsClip}
            panX={panX}
            panY={panY}
            viewOffsetPx={viewOffsetPx}
            zoom={zoom}
            roomRect={roomRect}
            isPanning={isPanningRef.current}
            onPanPointerDown={onPanPointerDown}
            onPanPointerMove={onPanPointerMove}
            onPanPointerUp={onPanPointerUp}
          >
            <RvRoomBaseLayers
              roomRect={roomRect}
              widthM={widthM}
              lengthM={lengthM}
              heightM={heightM}
              scale={scale}
              meterToCanvasX={meterToCanvasX}
              meterToCanvasY={meterToCanvasY}
              toPx={toPx}
              exportMode={exportMode}
              speakerPositionsView={speakerPositionsView}
              overlaysForRendering={overlaysForRendering}
              SPEAKER_PLAN_SIDE_GUTTER_PX={SPEAKER_PLAN_SIDE_GUTTER_PX}
              TOP_GUTTER_PX={TOP_GUTTER_PX}
              SPEAKER_PLAN_TOP_GUTTER_PX={SPEAKER_PLAN_TOP_GUTTER_PX}
              BOTTOM_GUTTER_PX={BOTTOM_GUTTER_PX}
              SPEAKER_PLAN_BOTTOM_GUTTER_PX={SPEAKER_PLAN_BOTTOM_GUTTER_PX}
              BaffleAndScreen={<RvBaffleAndScreen screen={screen} roomRect={roomRect} scale={scale} actualScreenFrontY={actualScreenFrontY} showBaffle={showBaffle} showScreen={showScreen} widthM={widthM} SCREEN_THICKNESS_M={SCREEN_THICKNESS_M} meterToCanvasX={meterToCanvasX} exportMode={exportMode} screenFrontPlaneM={screenFrontPlaneM} screenPlaneMode={screenPlaneMode} />}
              mlp={mlp}
              mlpPoint={mlpPoint}
              seatingPositions={seatingPositions}
              showThrowDistance={showThrowDistance}
              roomElements={roomElements}
              screenFrontPlaneM={screenFrontPlaneM}
            />

            {showRoomModesOverlay && (
              <RvModalZonesOverlay
                widthM={widthM}
                lengthM={lengthM}
                toPx={toPx}
                seatingPositions={seatingPositions}
                subwoofers={[
                  ...(frontLive || []),
                  ...(rearLive || [])
                ]}
              />
            )}

             <RvZonesAndOverlays
              exportMode={exportMode}
              overlaysForRendering={overlaysForRendering}
              augmentedZones={augmentedZones}
              toPx={toPx}
              placedSpeakers={placedSpeakers}
              mlp={mlp}
              widthM={widthM}
              lengthM={lengthM}
              heightM={heightM}
              getModelDimsM={getModelDimsM}
              roomRect={roomRect}
              WALL_BUFFER_M={WALL_BUFFER_M}
              dolbyLayout={dolbyLayout}
              overheadZones={overheadZones}
              getCanonicalRole={getCanonicalRole}
              scale={scale}
              frontWideZones={frontWideZones}
              meterToCanvasX={meterToCanvasX}
              meterToCanvasY={meterToCanvasY}
            />

            {/* Layer 5: Other Informational Zone Overlays */}
            {exportMode !== 'clean' && !!overlaysForRendering?.LCR && ZoneComponents.LCR}
            {exportMode !== 'clean' && !!overlaysForRendering?.SIDE_SURROUND && ZoneComponents.SIDE_SURROUND}
            {exportMode !== 'clean' && !!overlaysForRendering?.REAR_SURROUND && ZoneComponents.REAR_SURROUND}
            {exportMode !== 'clean' && overlaysForRendering?.enableDolbyZones && <RvDolbyZones hasRoomRect={hasRoomRect} overlaysForRendering={overlaysForRendering} mlp={mlp} toPx={toPx} widthM={widthM} lengthM={lengthM} dolbyLayout={dolbyLayout} getDolbyZoneSpecs={getDolbyZoneSpecs} arcPathForBand={arcPathForBand} />}

            {/* Layer 6: Static Room Elements (furniture, etc.) */}
            <RvRoomElementsLayer hasRoomRect={hasRoomRect} roomElements={roomElements} widthM={widthM} lengthM={lengthM} scale={scale} meterToCanvasX={meterToCanvasX} meterToCanvasY={meterToCanvasY} placedSpeakers={placedSpeakers} getModelDimsM={getModelDimsM} getSpeakerVisibility={getSpeakerVisibility} getCanonicalRole={getCanonicalRole} appState={appState} rolesForLayout={rolesForLayout} handleMouseDown={handleMouseDown} />

            {/* Room Element drag dimension lines moved outside RvZoomGroup — see below */}

            {/* Layer 7.5: MLP Position Ruler (when enabled) */}
            <RvMlpRuler
              exportMode={exportMode}
              showMlpRuler={showMlpRuler}
              mlp={mlp}
              toPx={toPx}
              roomRect={roomRect}
              screenFrontPlaneM={screenFrontPlaneM}
              scale={scale}
              widthM={widthM}
              lengthM={lengthM}
            />

            {/* Layer 8: Subwoofers (Front & Rear) - Unified render path */}
            {(() => {
              const isExportDims = exportMode === "dimensions";

              const getPinnedY = (wall, model) => {
                const EPS = 0.01;
                const lengthM_safe = Number(lengthM) || 6.0;
                let d = 0.30;
                try {
                  const dims = getModelDimsM?.(model) || {};
                  const dd = Number(dims?.depthM);
                  if (Number.isFinite(dd) && dd > 0) d = dd;
                } catch (_) { /* optional dimensions lookup */ }
                const halfD = d / 2;
                if (wall === "front") return halfD + EPS;
                if (wall === "rear") return Math.max(halfD + EPS, lengthM_safe - halfD - EPS);
                return halfD + EPS;
              };

              const buildFallbackLine = (qty, model, wall) => {
                const W = Number(widthM) || 4.5;
                const qtyN = Math.max(0, Math.min(8, Number(qty) || 0));
                if (!model || qtyN <= 0) return [];
                const y = getPinnedY(wall, model);

                const margin = W * 0.15;
                const span = Math.max(0.01, W - margin * 2);

                return Array.from({ length: qtyN }, (_, i) => ({
                  id: `export-sub-${wall}-${i + 1}`,
                  model,
                  position: {
                    x: qtyN === 1 ? W * 0.5 : margin + span * (i / (qtyN - 1)),
                    y,
                    z: 0
                  }
                }));
              };

              const frontFallbackLine = isExportDims && (!Array.isArray(frontLive) || frontLive.length === 0)
                ? buildFallbackLine(frontSubsCfg?.count, frontSubsCfg?.model, "front")
                : frontLive;

              const rearFallbackLine = isExportDims && (!Array.isArray(rearLive) || rearLive.length === 0)
                ? buildFallbackLine(rearSubsCfg?.count, rearSubsCfg?.model, "rear")
                : rearLive;

              const renderSubGroup = (subArray, layerName) => {
                if (!Array.isArray(subArray) || subArray.length === 0) return null;
                const groupPrefix = layerName.replace("-subwoofers", "");
                return (
                  <g data-layer={layerName}>
                    {subArray.map((sub, i) => {
                       if (!hasPos(sub)) return null;
                       const { widthM: subWm, depthM: subDm } = getModelDimsM(sub.model, sub.orientation ?? "vertical");
                      const subId = `${groupPrefix}-sub-${i}`;
                      const [cx, cy] = toPx(sub.position.x, sub.position.y);
                      const w = subWm * scale;
                      const d = subDm * scale;

                      const handlePointerDown = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* pointer capture is optional */ }
                        handleMouseDown(e, subId, "sub");
                      };

                      const handlePointerMove = (e) => {
                        if (!dragging || draggedItemId !== subId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        handleMouseMove(e);
                      };

                      const handlePointerUp = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { /* pointer capture is optional */ }
                        handleMouseUp(e);
                      };

                      return (
                        <g
                          key={subId}
                          style={{
                            cursor: dragging && draggedItemId === subId ? "grabbing" : "grab",
                            pointerEvents: "all"
                          }}
                          onPointerDown={handlePointerDown}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                        >
                          <rect
                            x={cx - w / 2}
                            y={cy - d / 2}
                            width={w}
                            height={d}
                            fill="transparent"
                            pointerEvents="all"
                          />
                          <rect
                            x={cx - w / 2}
                            y={cy - d / 2}
                            width={w}
                            height={d}
                            rx={0}
                            ry={0}
                            fill="#1a1a1a"
                            stroke="none"
                            strokeWidth={0}
                            opacity={0.8}
                            pointerEvents="none"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              };

              return (
                <>
                  {renderSubGroup(frontFallbackLine, "front-subwoofers")}
                  {renderSubGroup(rearFallbackLine, "rear-subwoofers")}
                </>
              );
            })()}

            {/* Layer 9: Draggable Seating Positions */}
            <RvSeatLayer seatingPositions={seatingPositions} toPx={toPx} scale={scale} exportMode={exportMode} speakerPositionsView={speakerPositionsView} rowFrontWallLabelSeatIds={rowFrontWallLabelSeatIds} rowDistanceLabelSeatIds={rowDistanceLabelSeatIds} _overlays={_overlays} hudPinnedSeatId={hudPinnedSeatId} handleMouseDown={handleMouseDown} handleSeatClick={handleSeatClick} clampMlpY={clampMlpY} MLPMarker={MLPMarker} />

            {/* Seat snap-to-zero indicator */}
            {isSeatSnapping && mlpPoint && (() => {
              const [sx, sy] = toPx(mlpPoint.x, mlpPoint.y);
              return (
                <g data-testid="rsp-snap-label" style={{ pointerEvents: 'none' }}>
                  <rect
                    x={sx - 44}
                    y={sy - 28}
                    width={88}
                    height={18}
                    rx={4}
                    fill="#4A230F"
                    opacity={0.85}
                  />
                  <text
                    x={sx}
                    y={sy - 15}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="#ffffff"
                  >
                    RSP aligned
                  </text>
                </g>
              );
            })()}

            {/* NEW: Render overhead icons */}
            {overheadIconElements}

            {/* Layer 10: Draggable Speakers */}
            <RvSpeakerLayer
              speakers={visiblePlanSpeakers}
              toPx={toPx}
              scale={scale}
              mlp={mlp}
              aimAtMLP={aimAtMLP}
              aimFrontWidesAtMLP={aimFrontWidesAtMLP}
              aimSideSurroundsAtMLP={aimSideSurroundsAtMLP}
              aimRearSurroundsAtMLP={aimRearSurroundsAtMLP}
              widthM={widthM}
              lengthM={lengthM}
              lcrAngleInfo={lcrAngleInfo}
              getCanonicalRole={getCanonicalRole}
              bedLayerSpeakerMouseDownHandler={bedLayerSpeakerMouseDownHandler}
              onSpeakerAimToggle={onSpeakerAimToggle}
              handleIconEnter={handleIconEnter}
              handleIconMove={handleIconMove}
              handleIconLeave={handleIconLeave}
            />


            {/* RP22 Surround Angles Overlay */}
            {exportMode !== 'clean' && <RvRp22AnglesOverlay hasRoomRect={hasRoomRect} scale={scale} effectiveHoveredSeat={effectiveHoveredSeat} visiblePlanSpeakers={visiblePlanSpeakers} getCanonicalRole={getCanonicalRole} toPx={toPx} floorDeg={floorDeg} />}

            {/* Speaker Positions Overlay */}
            {exportMode !== 'clean' && (
              <SpeakerPositionsOverlay
                speakers={placedSpeakers}
                seatingPositions={seatingPositions}
                dimensions={{ width: widthM, length: lengthM }}
                view={speakerPositionsView}
                meterToCanvasX={meterToCanvasX}
                meterToCanvasY={meterToCanvasY}
                roomRect={roomRect}
                getSpeakerVisibility={getSpeakerVisibility}
                getCanonicalRole={getCanonicalRole}
                exportMode={exportMode}
              />
            )}

            {exportMode !== 'clean' && (
              <PlanMessages
                dragWarning={dragWarning}
                tooltip={tooltip}
                hoveredSpeaker={hoveredSpeaker}
                svgW={svgW}
              />
            )}

            </RvZoomGroup>

            {/* Room Element drag dimensions — rendered OUTSIDE RvZoomGroup so the
                clipPath on the zoom group cannot clip annotation text near wall edges */}
            {dragType === 'roomElement' && roomElementDragInfo?.visible && (
              <RvRoomElementDragDims
                dragInfo={roomElementDragInfo}
                widthM={widthM}
                lengthM={lengthM}
                scale={scale}
                meterToCanvasX={meterToCanvasX}
                meterToCanvasY={meterToCanvasY}
                svgW={svgWSafe}
                svgH={svgHSafe}
              />
            )}

            {/* RSP / MLP drag dimensions — Stage 1, temporary while dragging only */}
            {dragType === 'mlpMarker' && mlpDragInfo?.visible && (
              <RvMlpDragDims
                dragInfo={mlpDragInfo}
                scale={scale}
                meterToCanvasX={meterToCanvasX}
                meterToCanvasY={meterToCanvasY}
                svgW={svgWSafe}
                svgH={svgHSafe}
              />
            )}
            </>
          )}
        </svg>

        {/* SEAT HOVER HUD - updated with drag and hide/show */}
        <RvSeatHudLayer
          exportMode={exportMode}
          tooltipData={tooltipData}
          effectiveHoveredSeat={effectiveHoveredSeat}
          hudPosition={hudPosition}
          hudDynamicStyle={hudDynamicStyle}
          onHudHeaderMouseDown={onHudHeaderMouseDown}
          hudElRef={hudElRef}
          setHudHiddenWhenPinned={setHudHiddenWhenPinned}
          hudHiddenWhenPinned={hudHiddenWhenPinned}
          renderLevelBadge={renderLevelBadge}
          isHudPinned={isHudPinned}
        />

        {/* SPEAKER TOOLTIP - Light style, non-interfering */}
        <RvSpeakerTooltip speakerTooltip={speakerTooltip} />

        {/* UNIVERSAL DRAG RP22/RP23 IMPACT CARD */}
        {dragImpact?.cardVisible && (
          <SeatingDragImpactCard
            baseline={dragImpact.baseline}
            live={dragImpact.live}
            seatingPositions={seatingPositions}
            baselineP20Results={dragImpact.baselineP20Results}
            currentP20Results={dragImpact.currentP20Results}
            mode={liveImpactMode}
            isPostDrag={isPostDrag}
            onAccept={onAcceptBaseline}
            onDismiss={onDismissCard}
          />
        )}



      </div>
    </div>
  );
}