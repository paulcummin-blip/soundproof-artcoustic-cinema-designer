/**
 * ReportDependencyChecker
 * -----------------------
 * Live dependency checker that replaces the generic "Preparing Visual Report…"
 * loading message. Shows the dealer exactly what is happening, what has
 * completed, what is still running, and what action they need to take.
 *
 * Designed as a shared component — accepts a `reportLabel` prop so it can be
 * reused by Technical Report, PDF Generation, AI Summary, and CAD Export.
 *
 * Views:
 *   1. Loading checklist  — ✓/⟳/□ markers for each dependency
 *   2. Bass never run      — actionable message + "Open Bass Simulation" button
 *   3. Timeout diagnostics — after ~20 seconds with no completion
 */

import React, { useState, useEffect } from "react";
import { readBassPendingIndicator } from "@/components/state/designReviewHandoff";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, CircleDashed, Clock } from "lucide-react";

const TIMEOUT_SECONDS = 20;

const cardStyle = {
  background: "#FFFFFF",
  borderRadius: 16,
  padding: "48px 40px",
  color: "#625143",
  fontFamily: "Didact Gothic, Century Gothic, sans-serif",
  boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
  border: "1px solid #DCDBD6",
  maxWidth: 520,
  margin: "0 auto",
};

const headingStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
  color: "#213428",
};

const textStyle = {
  fontSize: 14,
  color: "#625143",
  lineHeight: 1.6,
  margin: 0,
};

const depRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const depLabelStyle = {
  fontSize: 14,
  fontWeight: 500,
};

export default function ReportDependencyChecker({
  projectId,
  hydrating,
  projectDetails,
  roomDims,
  placedSpeakers,
  engineeringSummary,
  bassPerformance,
  onOpenBassSimulation,
  reportLabel = "Visual Report",
}) {
  const [bassPending, setBassPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Poll bass pending indicator
  useEffect(() => {
    if (!projectId) {
      setBassPending(false);
      return;
    }
    const check = () => setBassPending(readBassPendingIndicator(projectId));
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [projectId]);

  // Elapsed timer — counts seconds since the checker mounted
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Dependency statuses ──
  const projectLoaded = !hydrating && !!projectDetails;
  const roomReady = !hydrating && Number(roomDims?.widthM) > 0 && Number(roomDims?.lengthM) > 0;
  const speakersReady = !hydrating && Array.isArray(placedSpeakers) && placedSpeakers.length > 0;
  const rp22Ready = !!engineeringSummary;
  const bassReady = !!bassPerformance;
  const bassRunning = bassPending && !bassReady;

  const deps = [
    { key: "project", label: "Project loaded", done: projectLoaded },
    { key: "room", label: "Room geometry", done: roomReady },
    { key: "speakers", label: "Speaker layout", done: speakersReady },
    { key: "rp22", label: "RP22 calculations", done: rp22Ready },
    { key: "bass", label: "Bass simulation", done: bassReady, running: bassRunning },
  ];

  const allDone = deps.every((d) => d.done);
  const timedOut = elapsed >= TIMEOUT_SECONDS && !allDone;

  // Bass never run: RP22 is published but bass has no assessed result and
  // is not actively calculating.
  const bassNeverRun = rp22Ready && !bassReady && !bassRunning;

  // ── Timeout diagnostics view ──
  if (timedOut) {
    const waitingFor = deps.filter((d) => !d.done).map((d) => d.label);
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Clock style={{ color: "#625143", width: 24, height: 24 }} />
          <h2 style={headingStyle}>Generation is taking longer than expected.</h2>
        </div>
        <p style={textStyle}>Currently waiting for:</p>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {waitingFor.map((label) => (
            <div key={label} style={depRowStyle}>
              <CircleDashed style={{ color: "#625143", width: 18, height: 18 }} />
              <span style={depLabelStyle}>{label}</span>
            </div>
          ))}
        </div>
        <p style={{ ...textStyle, marginTop: 16 }}>
          No calculation has completed. The application is still working —
          please wait or return to the Room Designer to check progress.
        </p>
        {onOpenBassSimulation && (
          <Button
            onClick={onOpenBassSimulation}
            style={{
              marginTop: 20,
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              backgroundColor: "#213428",
              border: "1px solid #213428",
              color: "#FFFFFF",
            }}
          >
            Return to Room Designer
          </Button>
        )}
      </div>
    );
  }

  // ── Bass never run — actionable view ──
  if (bassNeverRun) {
    return (
      <div style={cardStyle}>
        <h2 style={headingStyle}>{reportLabel} cannot yet be generated.</h2>
        <p style={{ ...textStyle, marginTop: 12 }}>Waiting for:</p>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {deps.map((dep) => (
            <div key={dep.key} style={depRowStyle}>
              {dep.done ? (
                <CheckCircle2 style={{ color: "#213428", width: 18, height: 18 }} />
              ) : (
                <CircleDashed style={{ color: "#625143", width: 18, height: 18 }} />
              )}
              <span style={{ ...depLabelStyle, color: dep.done ? "#213428" : "#625143" }}>
                {dep.label}
              </span>
            </div>
          ))}
        </div>
        <p style={{ ...textStyle, marginTop: 20 }}>
          Bass Simulation has not yet been calculated. Open the Bass Simulation
          section in the Room Designer and press Calculate to continue.
        </p>
        {onOpenBassSimulation && (
          <Button
            onClick={onOpenBassSimulation}
            style={{
              marginTop: 20,
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              backgroundColor: "#213428",
              border: "1px solid #213428",
              color: "#FFFFFF",
            }}
          >
            Open Bass Simulation
          </Button>
        )}
      </div>
    );
  }

  // ── Loading checklist view ──
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Loader2 className="animate-spin" style={{ color: "#625143", width: 24, height: 24 }} />
        <h2 style={headingStyle}>Preparing {reportLabel}...</h2>
      </div>
      <p style={{ ...textStyle, marginBottom: 16 }}>Checking project...</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {deps.map((dep) => (
          <div key={dep.key} style={depRowStyle}>
            {dep.done ? (
              <CheckCircle2 style={{ color: "#213428", width: 18, height: 18 }} />
            ) : dep.running ? (
              <Loader2 className="animate-spin" style={{ color: "#625143", width: 18, height: 18 }} />
            ) : (
              <CircleDashed style={{ color: "#C4C0BA", width: 18, height: 18 }} />
            )}
            <span style={{ ...depLabelStyle, color: dep.done ? "#213428" : "#625143" }}>
              {dep.label}
            </span>
            {dep.running && (
              <span style={{ color: "#625143", fontSize: 13, marginLeft: 4 }}>
                Calculating...
              </span>
            )}
          </div>
        ))}
      </div>
      {bassRunning && (
        <p style={{ ...textStyle, marginTop: 16 }}>
          Waiting for Bass Simulation to complete...
        </p>
      )}
    </div>
  );
}