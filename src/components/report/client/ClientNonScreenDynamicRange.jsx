/**
 * ClientNonScreenDynamicRange
 * ---------------------------
 * Client-facing Visual Report page — Non-Screen Speakers SPL Capability.
 *
 * RP22 Parameter 13 — Non-Screen Speakers SPL Capability at RSP.
 * P13 is a ROOM parameter, measured at the Reference Seating Position.
 *
 * Uses the shared ClientSplCapabilityPlan (same room plan, scale and seating
 * geometry as the P5-style pages) with a 1.0 m result circle centred on the RSP.
 * The result card below communicates the achieved level; the drawing contains
 * no threshold bands, dB values or explanatory annotation.
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 */

import React from "react";
import ClientSplCapabilityPlan from "./ClientSplCapabilityPlan";
import ClientSplCapabilityResultCard from "./ClientSplCapabilityResultCard";

export default function ClientNonScreenDynamicRange({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  placedSpeakers,
  speakerSplValues,
  minimum,
  level,
  targetBasisLabel,
  resultHeading,
  resultExplanation,
  print,
}) {
  // In print mode, render ONLY the SVG (heading + result are in ClientReportPage)
  if (print) {
    return (
      <ClientSplCapabilityPlan
        roomDims={roomDims}
        seats={seats}
        rsp={rsp}
        screenFrontPlaneM={screenFrontPlaneM}
        screenWidthM={screenWidthM}
        placedSpeakers={placedSpeakers}
        mode="non-screen"
        level={level}
        print
      />
    );
  }

  // Screen: heading + SVG + wide result card
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 16,
        padding: 32,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        border: "1px solid #DCDBD6",
      }}
    >
      {/* Heading hierarchy: Category → Parameter reference */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            color: "#213428",
            letterSpacing: "0.01em",
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          }}
        >
          Dynamic Range
        </h1>
        <p
          style={{
            margin: "6px 0 0 0",
            fontSize: 12,
            color: "#625143",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          RP22 Parameter 13 — Non-Screen Speakers SPL Capability at RSP
        </p>
      </div>

      {/* SVG room plan */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <ClientSplCapabilityPlan
          roomDims={roomDims}
          seats={seats}
          rsp={rsp}
          screenFrontPlaneM={screenFrontPlaneM}
          screenWidthM={screenWidthM}
          placedSpeakers={placedSpeakers}
          mode="non-screen"
          level={level}
        />
      </div>

      {/* Wide result card */}
      <ClientSplCapabilityResultCard
        level={level}
        resultHeading={resultHeading}
        resultExplanation={resultExplanation}
        minimum={minimum}
        parameterLabel="minimum capability — RP22 Parameter 13"
        targetBasisLabel={targetBasisLabel}
        speakerSplValues={speakerSplValues}
      />
    </div>
  );
}