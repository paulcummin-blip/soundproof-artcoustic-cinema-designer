import React from "react";

/** Strict: only strings/numbers/null/elements render; anything else becomes a readable string */
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