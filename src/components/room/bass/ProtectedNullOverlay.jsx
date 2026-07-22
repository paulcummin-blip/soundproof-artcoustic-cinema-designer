import React from "react";
import { ReferenceArea, ReferenceLine } from "recharts";

export default function ProtectedNullOverlay({ annotations = [] }) {
  return annotations.map((annotation) => (
    <React.Fragment key={`${annotation.startHz}-${annotation.endHz}`}>
      <ReferenceArea x1={annotation.startHz} x2={annotation.endHz} fill="#D97706" fillOpacity={0.1} stroke="#D97706" strokeOpacity={0.35}>
        <title>{annotation.label}</title>
      </ReferenceArea>
      <ReferenceLine x={annotation.frequencyHz} stroke="#B45309" strokeWidth={1.5} opacity={0.8}>
        <title>{annotation.label}</title>
      </ReferenceLine>
    </React.Fragment>
  ));
}