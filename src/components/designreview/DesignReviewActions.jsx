/**
 * DesignReviewActions.jsx
 * -----------------------
 * Stage D — Export action buttons for the Design Review header.
 *
 * Actions — each carries the version being viewed and every return route, so a
 * review opened for one version only ever leads to that version's surfaces:
 *   1. Back to Project / Back to Project Library → the surface the review came from
 *   2. Visual Report    → navigate to RP22ClientReport, same project and version
 *   3. Download Technical Report (PDF) → navigate to /RP22Report?…&autoPrint=1
 *      (RP22Report owns the print/capture pipeline — no logic duplicated)
 *   4. Download CAD Overlay → uses standalone generateSVG/generateDXF utilities
 *      with live room data from useAppState (no second engine mount)
 */

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "@/components/AppStateProvider";
import { ArrowLeft, Eye, FileText, Download } from "lucide-react";
import { generateSVG, generateDXF, downloadTextFile } from "@/components/utils/cadExport";
import BackToProposalLink from "@/components/report/BackToProposalLink";
import BackToProjectLibraryLink from "@/components/report/BackToProjectLibraryLink";
import { readProposalContext } from "@/components/report/proposalReportContext";
import {
  buildReportPairingUrl,
  readLibraryContext,
  REPORT_ROUTE,
} from "@/components/report/reportLibraryContext";

const FONT = "'Futura PT Light', 'Century Gothic', sans-serif";

const BTN_BASE = {
  fontFamily: FONT,
  backgroundColor: "#F9F8F6",
  border: "1px solid",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  transition: "background 0.15s",
};

export default function DesignReviewActions({ projectId, versionId = null }) {
  const navigate = useNavigate();
  const app = useAppState();
  const [showCadMenu, setShowCadMenu] = useState(false);

  const handleBackToProject = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${projectId}`);
  };

  // The Design Review is the technical report surface reached from the Visual
  // Report, so the version being viewed and both return routes are carried on
  // through it rather than dropped. Every link is built by the shared pairing
  // authority: the loaded Room Designer version is never consulted, so a report
  // opened for one version can never lead to another version's report.
  const currentQuery = () => (typeof window !== "undefined" ? window.location.search : "");
  const currentProposalContext = () => readProposalContext(currentQuery());
  const currentLibraryContext = () => readLibraryContext(currentQuery());

  const handleVisualReport = () => {
    if (!projectId) return;
    navigate(buildReportPairingUrl({
      route: REPORT_ROUTE.VISUAL,
      projectId,
      versionId,
      libraryContext: currentLibraryContext(),
      proposalContext: currentProposalContext(),
    }));
  };

  const handleTechnicalPdf = () => {
    if (!projectId) return;
    // RP22Report owns the full print/capture pipeline — autoPrint triggers it,
    // for this same version and no other.
    navigate(buildReportPairingUrl({
      route: REPORT_ROUTE.TECHNICAL,
      projectId,
      versionId,
      libraryContext: currentLibraryContext(),
      proposalContext: currentProposalContext(),
      extraParams: { autoPrint: '1' },
    }));
  };

  // Gather CAD overlay data from live appState
  const cadData = useMemo(() => {
    const safe = (v, fb) => (Array.isArray(v) ? v : fb);
    const safeObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
    return {
      roomDims: app?.roomDims || {},
      seatingPositions: safe(app?.seatingPositions, []),
      placedSpeakers: safe(app?.speakerSystem?.placedSpeakers, []),
      screenFrontPlaneM: app?.screenFrontPlaneM,
      mlp: app?.seatingPositions?.find(s => s?.isPrimary) || app?.seatingPositions?.[0] || null,
      frontSubsCfg: safeObj(app?.frontSubsCfg),
      rearSubsCfg: safeObj(app?.rearSubsCfg),
      roomElements: safe(app?.roomElements, []),
      projector: safe(app?.roomElements, []).find(e => e?.type === "projector") || null,
    };
  }, [app]);

  const handleExportSVG = () => {
    const date = new Date().toISOString().split("T")[0];
    const filename = `RP22_CAD_Overlay_DesignReview_${date}.svg`;
    const svgContent = generateSVG(cadData);
    downloadTextFile(svgContent, filename, "image/svg+xml");
    setShowCadMenu(false);
  };

  const handleExportDXF = () => {
    const date = new Date().toISOString().split("T")[0];
    const filename = `RP22_CAD_Overlay_DesignReview_${date}.dxf`;
    const dxfContent = generateDXF(cadData);
    downloadTextFile(dxfContent, filename, "application/dxf");
    setShowCadMenu(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {/* Library context only — the primary return route when the review was
          opened from the Project Library. */}
      <BackToProjectLibraryLink projectId={projectId} versionId={versionId} />
      {/* Proposal context only — absent when the review was opened from the project flow */}
      <BackToProposalLink />
      <button
        onClick={handleBackToProject}
        disabled={!projectId}
        style={{
          ...BTN_BASE,
          borderColor: "#213428",
          color: "#213428",
          opacity: projectId ? 1 : 0.5,
        }}
      >
        <ArrowLeft style={{ width: 16, height: 16, color: "#213428" }} />
        Back to Project
      </button>

      <button
        onClick={handleVisualReport}
        disabled={!projectId}
        style={{
          ...BTN_BASE,
          borderColor: "#625143",
          color: "#625143",
          opacity: projectId ? 1 : 0.5,
        }}
      >
        <Eye style={{ width: 16, height: 16, color: "#625143" }} />
        Visual Report
      </button>

      <button
        onClick={handleTechnicalPdf}
        disabled={!projectId}
        style={{
          ...BTN_BASE,
          borderColor: "#625143",
          color: "#625143",
          opacity: projectId ? 1 : 0.5,
        }}
      >
        <FileText style={{ width: 16, height: 16, color: "#625143" }} />
        Download Technical Report (PDF)
      </button>

      <div style={{ position: "relative" }}>
        <button
          onClick={() => setShowCadMenu(!showCadMenu)}
          style={{
            ...BTN_BASE,
            borderColor: "#625143",
            color: "#625143",
          }}
        >
          <Download style={{ width: 16, height: 16, color: "#625143" }} />
          Download CAD Overlay
        </button>

        {showCadMenu && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 8,
              backgroundColor: "#FFFFFF",
              border: "1px solid #E6E4DD",
              borderRadius: 8,
              padding: 12,
              minWidth: 240,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              zIndex: 1000,
            }}
          >
            <div style={{ fontSize: 11, color: "#3E4349", marginBottom: 10 }}>
              Plan view only • true scale • overlay use
            </div>
            <button
              onClick={handleExportSVG}
              style={{
                width: "100%",
                marginBottom: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontFamily: FONT,
                backgroundColor: "#FFFFFF",
                border: "1px solid #E6E4DD",
                color: "#1B1A1A",
                borderRadius: 4,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Download SVG
            </button>
            <button
              onClick={handleExportDXF}
              style={{
                width: "100%",
                padding: "8px 16px",
                fontSize: 13,
                fontFamily: FONT,
                backgroundColor: "#FFFFFF",
                border: "1px solid #E6E4DD",
                color: "#1B1A1A",
                borderRadius: 4,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Download DXF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}