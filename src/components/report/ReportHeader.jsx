import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useActiveProjectId } from '@/components/state/project-session';
import { ArrowLeft, FileText, Download, Eye } from 'lucide-react';
import { generateSVG, generateDXF, downloadTextFile } from '../utils/cadExport';
import { isCadExportReady } from './cadExportReadiness';
import ReportCover from './ReportCover';
import BackToProposalLink from './BackToProposalLink';
import { readProposalContext } from './proposalReportContext';
import { buildReportPairingUrl, readLibraryContext, REPORT_ROUTE } from './reportLibraryContext';
import { readRequestedVersionId } from './reportVersionRequest';
import { restorePrintDocumentTitle } from '@/components/report/printDocumentTitle';
import { openTechnicalReportPrintWindow } from '@/components/report/technical/technicalReportPrintWindow';

export default function ReportHeader({
    app,
    seats,
    placedSpeakers,
    roomDims,
    primarySeatingPosition,
    frontSubsCfg,
    rearSubsCfg,
    roomElements,
    projector,
    screenMetrics,
    debugPlanCapture,
    setDebugPlanCapture,
    showCadExportMenu,
    setShowCadExportMenu,
    exportGuardRef,
    exportTimeoutRef,
    EXPORT_TIMEOUT_MS,
    resolveScreenMetricsSnapshot,
    setScreenMetricsForPrint,
    setScreenMetricsStatus,
    setExportStatus,
    setExportDebug,
    setHasPrintedOnce,
    setPlanImageDataUrl,
    setPlanDimsImageDataUrl,
    setPlanSpeakerDimsImageDataUrl,
    setIsPrinting,
    // Plan View aiming state — passed to cadExport so CAD angles match Plan View
    lcrAngleInfo,
    aimToggles,
    exportDisabled = false,
    exportDisabledMessage = "Bass analysis updating",
    // The report's own export filename. It names the app-owned print window
    // opened on the export click, so the saved PDF identifies itself: brand,
    // report type, dealer, project and reference.
    printTitle = null,
    // The app-owned print window, opened on the click while the browser still
    // treats the action as a user gesture, and filled by the report when it prints.
    printWindowRef = null,
    // Prints the report under its own filename. Every print path — including the
    // stalled-export fallback below — goes through it, so no path can fall back
    // to naming the file after the browser tab.
    onPrintFallback = null,
}) {
    const navigate = useNavigate();

    // Restore the tab's own title once the fallback print dialog has closed.
    React.useEffect(() => {
        window.addEventListener('afterprint', restorePrintDocumentTitle);
        return () => window.removeEventListener('afterprint', restorePrintDocumentTitle);
    }, []);

    const urlProjectId = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('projectId')
        : null;
    const sessionProjectId = useActiveProjectId();
    const activeProjectId = urlProjectId || sessionProjectId || null;

    // CAD-specific readiness — blocks CAD export until all CAD source data
    // (room dims, speakers, seating, subwoofer positions where applicable)
    // has populated AppState. Independent of the report-level exportDisabled
    // gate (which covers hydration/bass/recommendation status).
    const cadReady = isCadExportReady({
        roomDims,
        placedSpeakers,
        seatingPositions: seats,
        frontSubsCfg,
        rearSubsCfg,
    });
    const cadExportDisabled = exportDisabled || !cadReady;
    const cadDisabledMessage = !cadReady
        ? "CAD export is preparing the project data. Please wait."
        : exportDisabledMessage;

    const handleBackToProject = () => {
        if (!activeProjectId) return;
        navigate(`/RoomDesigner?projectId=${activeProjectId}`);
    };

    // The Visual and Technical Reports are one pairing: moving between them must
    // carry the whole report context — the version being viewed, the way back to
    // the Project Library when the report came from it, and the proposal context
    // — so no hop falls back to the Room Designer's active version and no way
    // back disappears mid-report. One shared authority builds every hop.
    const currentSearchParams = () => new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : ''
    );

    const handleClientReport = () => {
        if (!activeProjectId) return;
        const searchParams = currentSearchParams();
        navigate(buildReportPairingUrl({
            route: REPORT_ROUTE.VISUAL,
            projectId: activeProjectId,
            versionId: readRequestedVersionId(searchParams),
            libraryContext: readLibraryContext(searchParams),
            proposalContext: readProposalContext(searchParams),
        }));
    };

    const handleExportPDF = () => {
        if (exportDisabled || exportGuardRef.current.active) return;
        exportGuardRef.current = { active: true, startedAt: Date.now() };

        // Open the app-owned print window NOW, synchronously on the click, while
        // the browser still treats this as a user gesture. The capture pipeline
        // that follows takes long enough that a later window.open would be blocked
        // as an unwanted pop-up — and this window is what names the saved PDF
        // after the report instead of after the host tab.
        if (printWindowRef && !printWindowRef.current) {
            printWindowRef.current = openTechnicalReportPrintWindow(printTitle);
        }

        try {
            setScreenMetricsForPrint(resolveScreenMetricsSnapshot());
            setScreenMetricsStatus("Ready");
        } catch (e) {
            setScreenMetricsStatus("Error");
        }

        setExportStatus("Capturing plan images…");
        setExportDebug({ isPrinting: true, planLen: 0, printReady: false });
        setHasPrintedOnce(false);
        setPlanImageDataUrl(null);
        setPlanDimsImageDataUrl(null);
        setPlanSpeakerDimsImageDataUrl(null);
        setIsPrinting(true);

        if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
        exportTimeoutRef.current = setTimeout(() => {
            if (!exportGuardRef.current.active) return;
            exportGuardRef.current.active = false;
            setIsPrinting(false);
            setExportStatus("Export stalled — opening Print fallback…");
            try {
                alert("PDF export stalled. We'll open Print instead. In the print window choose 'Save as PDF'.");
                onPrintFallback();
            } catch (err) {
                alert("Export stalled and Print fallback couldn't open. Please try again.");
            }
        }, EXPORT_TIMEOUT_MS);
    };

    const handleExportSVG = () => {
        if (cadExportDisabled) return;
        const date = new Date().toISOString().split('T')[0];
        const filename = `RP22_CAD_Overlay_RP22Report_${date}.svg`;
        const svgContent = generateSVG({
            roomDims,
            seatingPositions: seats,
            placedSpeakers,
            screenFrontPlaneM: app?.screenFrontPlaneM,
            screenMetrics: screenMetrics || {},
            mlp: primarySeatingPosition,
            frontSubsCfg,
            rearSubsCfg,
            roomElements: roomElements || [],
            projector: projector || null,
            lcrAngleInfo: lcrAngleInfo || null,
            aimToggles: aimToggles || {},
        });
        downloadTextFile(svgContent, filename, 'image/svg+xml');
        setShowCadExportMenu(false);
    };

    const handleExportDXF = () => {
        if (cadExportDisabled) return;
        const date = new Date().toISOString().split('T')[0];
        const filename = `RP22_CAD_Overlay_RP22Report_${date}.dxf`;
        const dxfContent = generateDXF({
            roomDims,
            seatingPositions: seats,
            placedSpeakers,
            screenFrontPlaneM: app?.screenFrontPlaneM,
            screenMetrics: screenMetrics || {},
            mlp: primarySeatingPosition,
            frontSubsCfg,
            rearSubsCfg,
            roomElements: roomElements || [],
            projector: projector || null,
            lcrAngleInfo: lcrAngleInfo || null,
            aimToggles: aimToggles || {},
        });
        downloadTextFile(dxfContent, filename, 'application/dxf');
        setShowCadExportMenu(false);
    };

    return (
        <div>
        <ReportCover variant="screen" />
        <div className="flex items-start justify-end gap-4 mb-6">
            <div className="flex gap-3 items-center">
                {/* Proposal context only — absent when the report was opened from the project flow */}
                <BackToProposalLink />
                <Button
                    type="button"
                    onClick={handleBackToProject}
                    disabled={!activeProjectId}
                    className="px-5 py-2.5 border shadow-sm hover:bg-[#F1F0EE] whitespace-nowrap"
                    style={{
                        fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                        backgroundColor: "#F9F8F6",
                        borderColor: "#213428",
                        color: "#213428",
                        opacity: 1,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                    }}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" style={{ color: "#213428", flexShrink: 0 }} />
                    Back to Project
                </Button>

                <div className="screen-only">
                    <Button
                        type="button"
                        onClick={handleClientReport}
                        disabled={!activeProjectId}
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap flex-shrink-0 px-5 py-2.5 border shadow-sm hover:bg-[#F1F0EE]"
                        style={{
                            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                            backgroundColor: "#F9F8F6",
                            borderColor: "#625143",
                            color: "#625143",
                            opacity: 1,
                        }}
                    >
                        <Eye className="w-4 h-4" style={{ color: "#625143", flexShrink: 0 }} />
                        <span>Visual Report</span>
                    </Button>
                </div>

                <Button
                    type="button"
                    onClick={handleExportPDF}
                    disabled={exportDisabled}
                    title={exportDisabled ? exportDisabledMessage : "Download Technical Report (PDF)"}
                    className="px-5 py-2.5 border shadow-sm hover:bg-[#F1F0EE] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                    style={{
                        fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                        backgroundColor: "#FFFFFF",
                        borderColor: "#625143",
                        color: "#625143",
                        opacity: 1,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                    }}
                >
                    <FileText className="w-4 h-4 mr-2" style={{ color: "#625143", flexShrink: 0 }} />
                    {exportDisabled ? exportDisabledMessage : "Download Technical Report (PDF)"}
                </Button>

                <div style={{ position: 'relative' }}>
                    <Button
                        type="button"
                        onClick={() => setShowCadExportMenu(!showCadExportMenu)}
                        disabled={cadExportDisabled}
                        title={cadExportDisabled ? "CAD export is preparing the project data. Please wait." : "Download CAD Overlay (DXF/SVG)"}
                        className="px-5 py-2.5 border shadow-sm hover:bg-[#F1F0EE] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                        style={{
                            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                            backgroundColor: "#FFFFFF",
                            borderColor: "#625143",
                            color: "#625143",
                            opacity: 1,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}
                    >
                        <Download className="w-4 h-4 mr-2" style={{ color: "#625143", flexShrink: 0 }} />
                        {cadExportDisabled ? "Preparing CAD…" : "Download CAD Overlay"}
                    </Button>

                    {showCadExportMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '8px',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E6E4DD',
                                borderRadius: '8px',
                                padding: '12px',
                                minWidth: '240px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                zIndex: 1000,
                            }}
                        >
                            <div style={{ fontSize: '11px', color: '#3E4349', marginBottom: '10px' }}>
                                Plan view only • true scale • overlay use
                            </div>
                            {cadExportDisabled && (
                                <div style={{
                                    fontSize: '11px',
                                    color: '#625143',
                                    marginBottom: '10px',
                                    padding: '6px 8px',
                                    background: '#F9F8F6',
                                    border: '1px solid #E6E4DD',
                                    borderRadius: '4px',
                                    lineHeight: 1.4,
                                }}>
                                    {cadDisabledMessage}
                                </div>
                            )}
                            <Button
                                type="button"
                                onClick={handleExportSVG}
                                disabled={cadExportDisabled}
                                className="w-full mb-2 px-4 py-2 text-sm hover:bg-[#F9F8F6] disabled:cursor-not-allowed disabled:opacity-50"
                                style={{
                                    fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                                    backgroundColor: "#FFFFFF",
                                    border: '1px solid #E6E4DD',
                                    color: "#1B1A1A",
                                    justifyContent: 'flex-start',
                                }}
                            >
                                Download SVG
                            </Button>
                            <Button
                                type="button"
                                onClick={handleExportDXF}
                                disabled={cadExportDisabled}
                                className="w-full px-4 py-2 text-sm hover:bg-[#F9F8F6] disabled:cursor-not-allowed disabled:opacity-50"
                                style={{
                                    fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                                    backgroundColor: "#FFFFFF",
                                    border: '1px solid #E6E4DD',
                                    color: "#1B1A1A",
                                    justifyContent: 'flex-start',
                                }}
                            >
                                Download DXF
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </div>
    );
}