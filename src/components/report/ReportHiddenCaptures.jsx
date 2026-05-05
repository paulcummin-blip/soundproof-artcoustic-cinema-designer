import React from 'react';
import RoomVisualisation from '../room/RoomVisualisation';

function buildSubsForExport(cfg, group, roomDims) {
    const count = Math.max(0, Number(cfg?.count ?? cfg?.qty ?? 0) || 0);
    const model = cfg?.model || '';
    if (count === 0 || !model) return [];

    const width = Number(roomDims?.widthM) || 4.5;
    const length = Number(roomDims?.lengthM) || 6.0;
    const y = group === 'front' ? 0.16 : length - 0.16;

    const positions = Array.isArray(cfg?.positions) ? cfg.positions : [];

    return Array.from({ length: count }, (_, i) => {
        const savedX = positions[i]?.x;
        let x;
        if (Number.isFinite(savedX)) {
            x = savedX;
        } else if (count === 1) {
            x = width * 0.5;
        } else {
            const margin = width * 0.15;
            const span = width - 2 * margin;
            x = margin + (span / (count - 1)) * i;
        }
        const num = i + 1;
        return {
            id: `sub-${group}-${num}`,
            group,
            role: group === 'front' ? `SUBF${num}` : `SUBR${num}`,
            model,
            isSub: true,
            position: { x, y, z: 0 },
        };
    });
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
        floatDepthM: screenFrontPlaneM ?? (Number(screen?.floatDepthM) || 0),
    };

    const allLiveSubs = Array.isArray(app?.subwoofers) ? app.subwoofers : [];
    const frontSubsForExport = allLiveSubs.filter((sub) => sub?.group === 'front');
    const rearSubsForExport = allLiveSubs.filter((sub) => sub?.group === 'rear');

    const liveOverlays = {
        ...(app?.overlays || {}),
        FRONT_WIDE: app?.overlays?.FRONT_WIDE,
        enableFrontWides: app?.enableFrontWides,
    };

    const commonProps = {
        placedSpeakers,
        seatingPositions: seats,
        mlpPoint: primarySeatingPosition,
        screen: screenWithDepth,
        screenFrontPlaneM,
        dolbyLayout,
        frontSubs: frontSubsForExport,
        rearSubs: rearSubsForExport,
        frontSubsCfg: app?.frontSubsCfg,
        rearSubsCfg: app?.rearSubsCfg,
        roomElements: app?.roomElements || [],
        exportMode: "dimensions",
        exportWidthPx: 1200,
        exportHeightPx: 800,
        showBaffle: true,
        showScreen: true,
        zoomMode: "off",
        screenPlaneMode: "autoTight",
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
                    overlays={{
                        ...liveOverlays,
                        ROOM_DIMS: true,
                        EXPORT_ROW_FRONT_DIST: true,
                        EXPORT_RSP_LABEL: true,
                        EXPORT_CEILING_LABEL: true,
                    }}
                    speakerPositionsView="off"
                    showMlpRuler={false}
                    showThrowDistance={true}
                />
            </div>

            {/* Dimensioned plan (room dimensions + MLP ruler) */}
            <div data-plan-capture-dims style={HIDDEN_STYLE}>
                <RoomVisualisation
                    {...commonProps}
                    overlays={{
                        ...liveOverlays,
                    }}
                    speakerPositionsView="off"
                    showMlpRuler={true}
                    showThrowDistance={false}
                />
            </div>

            {/* Speaker positions plan */}
            <div data-plan-capture-speaker-dims style={HIDDEN_STYLE}>
                <RoomVisualisation
                    {...commonProps}
                    overlays={{
                        ...liveOverlays,
                    }}
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
                    frontSubs={frontSubsForExport}
                    rearSubs={rearSubsForExport}
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