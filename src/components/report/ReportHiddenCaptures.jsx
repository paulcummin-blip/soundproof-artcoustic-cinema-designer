import React from 'react';
import RoomVisualisation from '../room/RoomVisualisation';

function buildSubsForExport(cfg, group, roomDims) {
    const count = Number(cfg?.count) || 0;
    const model = cfg?.model || '';
    if (count === 0 || !model) return [];

    const widthM = Number(roomDims?.widthM) || 4.5;
    const lengthM = Number(roomDims?.lengthM) || 6.0;
    const isFront = group === 'front';
    const rolePrefix = isFront ? 'SUBF' : 'SUBR';
    const yPos = isFront ? 0.16 : lengthM - 0.16;
    const margin = 0.3;

    // Try to use stored positions if they have valid numeric x values
    const stored = Array.isArray(cfg?.positions) ? cfg.positions : [];
    const validStored = stored.filter(p => {
        const x = p?.position?.x ?? p?.x;
        return Number.isFinite(Number(x));
    });

    if (validStored.length === count) {
        return validStored.map((p, i) => {
            const x = Number(p?.position?.x ?? p?.x);
            const y = Number(p?.position?.y ?? p?.y ?? yPos);
            return { id: p.id || `${group}-sub-${i}`, group, role: `${rolePrefix}${i + 1}`, model, isSub: true, position: { x, y, z: 0 } };
        });
    }

    // Generate evenly spaced positions
    const step = count > 1 ? (widthM - 2 * margin) / (count - 1) : 0;
    return Array.from({ length: count }, (_, i) => ({
        id: `${group}-sub-${i}`,
        group,
        role: `${rolePrefix}${i + 1}`,
        model,
        isSub: true,
        position: { x: count === 1 ? widthM / 2 : margin + i * step, y: yPos, z: 0 },
    }));
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