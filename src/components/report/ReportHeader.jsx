import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useActiveProjectId } from '@/components/state/project-session';
import { ArrowLeft, FileText, Download, Eye } from 'lucide-react';
import { generateSVG, generateDXF, downloadTextFile } from '../utils/cadExport';
import ReportCover from './ReportCover';

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
}) {
    const navigate = useNavigate();

    const urlProjectId = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('projectId')
        : null;
    const sessionProjectId = useActiveProjectId();
    const activeProjectId = urlProjectId || sessionProjectId || null;

    const handleBackToProject = () => {
        if (!activeProjectId) return;
        navigate(`/RoomDesigner?projectId=${activeProjectId}`);
    };

    const handleClientReport = () => {
        if (!activeProjectId) return;
        navigate(`/RP22ClientReport?projectId=${activeProjectId}`);
    };

    const handleExportPDF = () => {
        if (exportDisabled || exportGuardRef.current.active) return;
        exportGuardRef.current = { active: true, startedAt: Date.now() };

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
                setTimeout(() => window.print(), 250);
            } catch (err) {
                alert("Export stalled and Print fallback couldn't open. Please try again.");
            }
        }, EXPORT_TIMEOUT_MS);
    };

    const handleExportSVG = () => {
        if (exportDisabled) return;
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
        if (exportDisabled) return;
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
                        disabled={exportDisabled}
                        title={exportDisabled ? "CAD export is preparing the project data. Please wait." : "Download CAD Overlay (DXF/SVG)"}
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
                        {exportDisabled ? "Preparing CAD…" : "Download CAD Overlay"}
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
                            {exportDisabled && (
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
                                    CAD export is preparing the project data. Please wait.
                                </div>
                            )}
                            <Button
                                type="button"
                                onClick={handleExportSVG}
                                disabled={exportDisabled}
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
                                disabled={exportDisabled}
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