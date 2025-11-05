import React from "react";

/** Only render strings/numbers/elements; stringify everything else. */
export function RenderPrimitive({ value }) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return <>{value}</>;
  if (React.isValidElement(value)) return value;
  try {
    return <span>{JSON.stringify(value)}</span>;
  } catch {
    return <span>[unrenderable]</span>;
  }
}

export default RenderPrimitive;