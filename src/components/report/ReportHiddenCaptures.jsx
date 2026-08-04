import React, { useEffect, useMemo } from 'react';
import RoomVisualisation from '../room/RoomVisualisation';
import RvStaticCanvas from './RvStaticCanvas';

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

// Stable no-op callbacks — created once at module scope so they never trigger re-renders.
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

// Stable empty overlays object for the seat-metrics-builder capture.
const EMPTY_OVERLAYS = Object.freeze({});

export default function ReportHiddenCaptures({
    app,
    placedSpeakers,
    seats,
    primarySeatingPosition,
    screen,
    dolbyLayout,
}) {
    useEffect(() => {
        console.log("[REPORT CAPTURE MOUNT]", "rv-static-canvas");
        console.log("[REPORT CAPTURE MOUNT]", "report-dimensioned-plan");
        console.log("[REPORT CAPTURE MOUNT]", "report-speaker-plan");
        console.log("[REPORT CAPTURE MOUNT]", "report-seat-metrics");
    }, []);

    // --- Extract only the fields we need from `app` so useMemo deps are stable ---
    const screenFrontPlaneM = Number.isFinite(Number(app?.screenFrontPlaneM))
        ? Number(app.screenFrontPlaneM)
        : undefined;

    const allLiveSubs = app?.subwoofers;
    const appOverlays = app?.overlays;
    const enableFrontWides = app?.enableFrontWides;
    const frontSubsCfg = app?.frontSubsCfg;
    const rearSubsCfg = app?.rearSubsCfg;
    const roomElements = app?.roomElements;
    const lcrAimMode = app?.lcrAimMode;
    const aimAtMLP = app?.aimAtMLP;

    // --- Memoize all derived data so RoomVisualisation receives stable prop refs ---
    const screenWithDepth = useMemo(() => ({
        ...(screen || {}),
        floatDepthM: screenFrontPlaneM ?? (Number(screen?.floatDepthM) || 0),
    }), [screen, screenFrontPlaneM]);

    const frontSubsForExport = useMemo(
        () => (Array.isArray(allLiveSubs) ? allLiveSubs.filter((sub) => sub?.group === 'front') : []),
        [allLiveSubs]
    );

    const rearSubsForExport = useMemo(
        () => (Array.isArray(allLiveSubs) ? allLiveSubs.filter((sub) => sub?.group === 'rear') : []),
        [allLiveSubs]
    );

    const liveOverlays = useMemo(() => ({
        ...(appOverlays || {}),
        FRONT_WIDE: appOverlays?.FRONT_WIDE,
        enableFrontWides,
    }), [appOverlays, enableFrontWides]);

    const stableRoomElements = useMemo(
        () => (Array.isArray(roomElements) ? roomElements : []),
        [roomElements]
    );

    // The common props shared by the two static plan captures.
    // Memoized so that RvStaticCanvas never receives a new `commonProps` object
    // unless one of its actual dependencies changed.
    const commonProps = useMemo(() => ({
        placedSpeakers,
        seatingPositions: seats,
        mlpPoint: primarySeatingPosition,
        screen: screenWithDepth,
        screenFrontPlaneM,
        dolbyLayout,
        frontSubs: frontSubsForExport,
        rearSubs: rearSubsForExport,
        frontSubsCfg,
        rearSubsCfg,
        roomElements: stableRoomElements,
        exportMode: "dimensions",
        exportWidthPx: 1200,
        exportHeightPx: 800,
        showBaffle: true,
        showScreen: true,
        zoomMode: "off",
        screenPlaneMode: "fixed",
        lcrAimMode: lcrAimMode || "flat",
        aimAtMLP: aimAtMLP ?? false,
        ...NOOPS,
    }), [
        placedSpeakers, seats, primarySeatingPosition, screenWithDepth,
        screenFrontPlaneM, dolbyLayout, frontSubsForExport, rearSubsForExport,
        frontSubsCfg, rearSubsCfg, stableRoomElements, lcrAimMode, aimAtMLP,
    ]);

    // Memoize each overlay variant so they are stable across re-renders.
    const overlaysClean = useMemo(() => ({
        ...liveOverlays,
        ROOM_DIMS: true,
        EXPORT_ROW_FRONT_DIST: true,
        EXPORT_RSP_LABEL: true,
        EXPORT_CEILING_LABEL: true,
    }), [liveOverlays]);

    const overlaysDims = useMemo(() => ({
        ...liveOverlays,
    }), [liveOverlays]);

    return (
        <>
            {/* Clean plan (no dimensions, with RP22 zone labels) */}
            {/* Stage A: RvStaticCanvas replaces RoomVisualisation to bypass the
                acoustic engine (useRP22AnalysisEngine, useSeatResponses,
                useLiveImpactBaseline, useSeatMetricsCacheEffect) for this
                geometry-only capture. */}
            <div data-plan-capture style={HIDDEN_STYLE}>
                <RvStaticCanvas
                    placedSpeakers={placedSpeakers}
                    seatingPositions={seats}
                    mlpPoint={primarySeatingPosition}
                    screen={screenWithDepth}
                    dolbyLayout={dolbyLayout}
                    frontSubs={frontSubsForExport}
                    rearSubs={rearSubsForExport}
                    frontSubsCfg={frontSubsCfg}
                    rearSubsCfg={rearSubsCfg}
                    roomElements={stableRoomElements}
                    exportMode="dimensions"
                    exportWidthPx={1200}
                    exportHeightPx={800}
                    showBaffle={true}
                    showScreen={true}
                    screenFrontPlaneM={screenFrontPlaneM}
                    screenPlaneMode="fixed"
                    speakerPositionsView="off"
                    showMlpRuler={false}
                    overlays={overlaysClean}
                    lcrAimMode={lcrAimMode || "flat"}
                    aimAtMLP={aimAtMLP ?? false}
                    appState={app}
                />
            </div>

            {/* Dimensioned plan (room dimensions + MLP ruler) */}
            <div data-plan-capture-dims style={HIDDEN_STYLE}>
                <RvStaticCanvas
                    {...commonProps}
                    appState={app}
                    overlays={overlaysDims}
                    speakerPositionsView="off"
                    showMlpRuler={true}
                    showThrowDistance={true}
                />
            </div>

            {/* Speaker positions plan */}
            <div data-plan-capture-speaker-dims style={HIDDEN_STYLE}>
                <RvStaticCanvas
                    {...commonProps}
                    appState={app}
                    overlays={overlaysDims}
                    speakerPositionsView="plan"
                    showMlpRuler={false}
                />
            </div>

            {/* Seat metrics builder (keeps seatMetricsById live) */}
            <div data-seat-metrics-builder style={HIDDEN_STYLE}>
                <RoomVisualisation
                    rp22DiagnosticOwner="report-seat-metrics"
                    placedSpeakers={placedSpeakers}
                    seatingPositions={seats}
                    mlpPoint={primarySeatingPosition}
                    screen={screen}
                    exportWidthPx={1200}
                    exportHeightPx={800}
                    dolbyLayout={dolbyLayout}
                    frontSubs={frontSubsForExport}
                    rearSubs={rearSubsForExport}
                    overlays={EMPTY_OVERLAYS}
                    showBaffle={true}
                    showScreen={true}
                    speakerPositionsView="off"
                    showMlpRuler={false}
                    zoomMode="off"
                    aimAtMLP={aimAtMLP ?? false}
                    {...NOOPS}
                />
            </div>
        </>
    );
}
