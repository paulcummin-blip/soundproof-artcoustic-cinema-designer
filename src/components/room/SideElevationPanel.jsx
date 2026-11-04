// SideElevationPanel.jsx — wrapper for the Side Elevation drawing tab.
//
// Extracted from RoomDesigner.jsx to keep that page under the file-size limit.
// Behaviour, props and styling are unchanged: this holds the left/right wall
// toggle and the SideElevation component with its existing callbacks.

import React from "react";
import SideElevation from "@/components/room/SideElevation";

export default function SideElevationPanel({
  stableDimensions,
  screen,
  seatingPositions,
  mlpAnchorEffective,
  roomElements,
  placedSpeakers,
  frontSubsForRendering,
  frontSubsCfg,
  rearSubsForRendering,
  rearSubsCfg,
  setScreenGuarded,
  setSpeakers,
  compat,
  appState,
  sideElevationWall,
  setSideElevationWall,
}) {
  return (
    <>
      {/* Left/Right wall toggle */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #DCDBD6', background: '#FAFAF8' }}>
        <span style={{ fontSize: 10, color: '#9B9890', fontWeight: 600, letterSpacing: '0.06em', alignSelf: 'center', marginRight: 4 }}>VIEWING WALL:</span>
        {['left', 'right'].map(w => (
          <button
            key={w}
            onClick={() => setSideElevationWall(w)}
            style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 5, border: sideElevationWall === w ? '1px solid #213428' : '1px solid #DCDBD6', background: sideElevationWall === w ? '#213428' : '#fff', color: sideElevationWall === w ? '#fff' : '#625143', cursor: 'pointer' }}
          >
            {w.toUpperCase()} WALL
          </button>
        ))}
      </div>
      <SideElevation
        dimensions={stableDimensions}
        screen={screen}
        seatingPositions={seatingPositions}
        mlpPoint={mlpAnchorEffective}
        roomElements={roomElements}
        placedSpeakers={placedSpeakers}
        frontSubs={frontSubsForRendering}
        frontSubsCfg={frontSubsCfg}
        rearSubs={rearSubsForRendering}
        rearSubsCfg={rearSubsCfg}
        wall={sideElevationWall}
        onScreenHeightFromFloorChange={(h) => setScreenGuarded(prev => ({ ...prev, heightFromFloorM: h }))}
        onSideSpeakerMoved={({ role, newZ, newY }) => {
          const movesZ = Number.isFinite(newZ);
          const movesY = Number.isFinite(newY);
          if (!movesZ && !movesY) return;
          // Standard paired roles — both sides share the height and the
          // along-wall position, so a pair stays symmetrical.
          const PAIRS = { LW: 'RW', RW: 'LW', SL: 'SR', SR: 'SL', SBL: 'SBR', SBR: 'SBL' };
          const paired = PAIRS[role] || null;
          // Extra surrounds (SL2/SR2, SL3/SR3…): match exact role only
          const isExtraSurround = /^(SL|SR)\d+$/.test(role);
          setSpeakers(prev => prev.map(s => {
            const r = String(s.role).toUpperCase();
            if (r !== role && !(!isExtraSurround && paired && r === paired)) return s;
            // One write of the speaker's own coordinates, recorded as the
            // designer's own position so no automatic pass moves it back.
            const position = { ...s.position };
            if (movesZ) position.z = newZ;
            if (movesY) position.y = newY;
            return { ...s, position, positionSource: 'user' };
          }));
        }}
        onFrontSubHeightChange={(bottomHeightM) => compat.setFrontBottomHeight(bottomHeightM)}
        onRearSubHeightChange={(bottomHeightM) => compat.setRearBottomHeight(bottomHeightM)}
        onSeatRowDragCommit={({ rowNumber, newY }) => {
          if (!Number.isFinite(newY) || !Number.isInteger(rowNumber)) return;
          const roundedY = Math.round(newY * 100) / 100;

          // 1) Update seatingPositions — all seats in the dragged row get the new Y
          if (appState?.setSeatingPositions) {
            appState.setSeatingPositions(prev =>
              (Array.isArray(prev) ? prev : []).map(s => {
                if (Number(s?.rowNumber) !== rowNumber) return s;
                return { ...s, y: roundedY };
              })
            );
          }

          // 2) Update rowCentersM — the dragged row's centre
          if (appState?.setRowCentersM) {
            appState.setRowCentersM(prev => {
              const next = Array.isArray(prev) ? prev.slice() : [];
              const idx = rowNumber - 1;
              if (idx >= 0 && idx < next.length) {
                next[idx] = roundedY;
              } else if (idx === next.length) {
                next.push(roundedY);
              }
              return next;
            });
          }

          // 3) Update seatingBlockOffset if row 1 changed
          if (rowNumber === 1 && appState?.setSeatingBlockOffset) {
            appState.setSeatingBlockOffset(roundedY);
          }
        }}
      />
    </>
  );
}