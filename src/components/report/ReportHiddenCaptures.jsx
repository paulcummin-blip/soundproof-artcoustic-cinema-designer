import React from 'react';
import RoomVisualisation from '../room/RoomVisualisation';

function buildSubsForExport(subsCfg, prefix) {
    return (Array.isArray(subsCfg?.positions) ? subsCfg.positions : []).map((p, i) => {
        if (p?.position?.x != null && p?.position?.y != null) {
            return { ...p, id: p.id || `${prefix}-sub-${i}`, model: p.model || subsCfg?.model || '' };
        }
        if (p?.x != null && p?.y != null) {
            return { ...p, id: p.id || `${prefix}-sub-${i}`, position: { x: p.x, y: p.y }, model: p.model || subsCfg?.model || '' };
        }
        return null;
    }).filter(Boolean);
}

const HIDDEN_STYLE = {
    position: 'fixed',
    left: 0,
    top: 0,
    width: '1200px',
    height: '800px',
    opacity: 0,
    pointerEvents: 'none',
    zIndex: -1,
};

const NOOPS = {
    onSetSpeakers: () => {},
    onSetSeatingPositions: () => {},
    onSetScreen: () => {},
    onSetFrontSubsCfg: () => {},
    onSetRearSubsCfg: () => {},
    onSetElements: () => {},
    onSetOverheadState: () => {},
    onSetAimState: () => {},
    onSetRoomDims: () => {},
    onSetMlpPoint: () => {},
};

export default function ReportHiddenCaptures({
    app,
    placedSpeakers,
    seats,
    primarySeatingPosition,
    screen,
    dolbyLayout,
}) {
    const screenFrontPlaneM = Number.isFinite(Number(app?.screenFrontPlaneM))
        ? Number(app.screenFrontPlaneM)
        : undefined;

    const screenWithDepth = {
        ...(screen || {}),
        floatDepthM: screenFrontPlaneM ?? Number(screen?.floatDepthM) || 0,
    };

    const frontSubsForExport = buildSubsForExport(app?.frontSubsCfg, 'front');
    const rearSubsForExport = buildSubsForExport(app?.rearSubsCfg, 'rear');

    const commonProps = {
        placedSpeakers,
        seatingPositions: seats,
        mlpPoint: primarySeatingPosition,
        screen: screenWithDepth,
        screenFrontPlaneM,
        dolbyLayout,
        frontSubs: frontSubsForExport,
        rearSubs: rearSubsForExport,
        roomElements: app?.roomElements || [],
        exportMode: "dimensions",
        exportWidthPx: 1200,
        exportHeightPx: 800,
        showBaffle: true,
        showScreen: true,
        zoomMode: "off",
        screenPlaneMode: "fixed",
        lcrAimMode: app?.lcrAimMode || "flat",
        aimAtMLP: app?.aimAtMLP ?? false,
        ...NOOPS,
    };

    return (
        <>
            {/* Clean plan (no dimensions, with RP22 zone labels) */}
            <div data-plan-capture style={HIDDEN_STYLE}>
                <RoomVisualisation
                    {...commonProps}
                    overlays={{ ROOM_DIMS: true, EXPORT_ROW_FRONT_DIST: true, EXPORT_RSP_LABEL: true, EXPORT_CEILING_LABEL: true }}
                    speakerPositionsView="off"
                    showMlpRuler={false}
                />
            </div>

            {/* Dimensioned plan (room dimensions + MLP ruler) */}
            <div data-plan-capture-dims style={HIDDEN_STYLE}>
                <RoomVisualisation
                    {...commonProps}
                    overlays={{}}
                    speakerPositionsView="off"
                    showMlpRuler={true}
                />
            </div>

            {/* Speaker positions plan */}
            <div data-plan-capture-speaker-dims style={HIDDEN_STYLE}>
                <RoomVisualisation
                    {...commonProps}
                    overlays={{}}
                    speakerPositionsView="plan"
                    showMlpRuler={false}
                />
            </div>

            {/* Seat metrics builder (keeps seatMetricsById live) */}
            <div data-seat-metrics-builder style={HIDDEN_STYLE}>
                <RoomVisualisation
                    placedSpeakers={placedSpeakers}
                    seatingPositions={seats}
                    mlpPoint={primarySeatingPosition}
                    screen={screen}
                    exportWidthPx={1200}
                    exportHeightPx={800}
                    dolbyLayout={dolbyLayout}
                    frontSubs={app?.frontSubsCfg?.positions || []}
                    rearSubs={app?.rearSubsCfg?.positions || []}
                    overlays={{}}
                    showBaffle={true}
                    showScreen={true}
                    speakerPositionsView="off"
                    showMlpRuler={false}
                    zoomMode="off"
                    aimAtMLP={app?.aimAtMLP ?? false}
                    {...NOOPS}
                />
            </div>
        </>
    );
}