/**
 * RP22ClientReport
 * ----------------
 * Client-facing Visual Report — Page 1: Sound Around the Listener
 * (RP22 Parameter 5 — Spatial resolution)
 *
 * Route: /RP22ClientReport?projectId={projectId}
 *
 * Does NOT mount useRP22AnalysisEngine, useSeatResponses, or RoomVisualisation.
 * Builds one page-local, hydration-gated P5 snapshot using existing production
 * helpers only.
 */

import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useActiveProjectId } from "@/components/state/project-session";
import { useClientReportAuthority } from "@/components/report/client/useClientReportAuthority";
import ClientSoundAroundListener from "@/components/report/client/ClientSoundAroundListener";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

export default function RP22ClientReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionProjectId = useActiveProjectId();

  const projectId = useMemo(
    () =>
      searchParams.get("projectId") ||
      searchParams.get("id") ||
      sessionProjectId ||
      null,
    [searchParams, sessionProjectId]
  );

  const authority = useClientReportAuthority(projectId);
  const { hydrating, projectDetails, p5Snapshot, roomDims, screen, screenFrontPlaneM } = authority;

  const handleBackToProject = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${projectId}`);
  };

  const handleTechnicalReport = () => {
    if (!projectId) return;
    navigate(`/RP22Report?projectId=${projectId}`);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0E0E0E",
      fontFamily: "Didact Gothic, sans-serif",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: "20px 32px",
        borderBottom: "1px solid #2A2A2A",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: "#F5F5F5",
          }}>
            Client Visual Report
          </h1>
          {projectDetails && (
            <p style={{
              margin: "4px 0 0 0",
              fontSize: 13,
              color: "#8A8A8A",
            }}>
              {projectDetails.name}
              {projectDetails.client_name ? ` — ${projectDetails.client_name}` : ""}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button
            type="button"
            onClick={handleBackToProject}
            disabled={!projectId}
            style={{
              fontFamily: "Didact Gothic, sans-serif",
              backgroundColor: "#1E1E1E",
              border: "1px solid #3A3A3A",
              color: "#F5F5F5",
              opacity: 1,
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" style={{ color: "#F5F5F5" }} />
            Back to Project
          </Button>
          <Button
            type="button"
            onClick={handleTechnicalReport}
            disabled={!projectId}
            style={{
              fontFamily: "Didact Gothic, sans-serif",
              backgroundColor: "#1E1E1E",
              border: "1px solid #3A3A3A",
              color: "#F5F5F5",
              opacity: 1,
            }}
          >
            <FileText className="w-4 h-4 mr-2" style={{ color: "#F5F5F5" }} />
            Technical RP22 Report
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{
        padding: "32px",
        maxWidth: 900,
        margin: "0 auto",
      }}>
        {hydrating ? (
          <div style={{
            background: "#161616",
            borderRadius: 16,
            padding: 64,
            textAlign: "center",
            color: "#8A8A8A",
            fontFamily: "Didact Gothic, sans-serif",
          }}>
            Loading project…
          </div>
        ) : !projectId ? (
          <div style={{
            background: "#161616",
            borderRadius: 16,
            padding: 64,
            textAlign: "center",
            color: "#8A8A8A",
            fontFamily: "Didact Gothic, sans-serif",
          }}>
            No project selected. Open a project from the Room Designer to view its Client Visual Report.
          </div>
        ) : (
          <ClientSoundAroundListener
            p5Snapshot={p5Snapshot}
            roomDims={roomDims}
            screen={screen}
            screenFrontPlaneM={screenFrontPlaneM}
          />
        )}
      </div>
    </div>
  );
}