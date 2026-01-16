import React from "react";

// Safe, crash-proof grading pill.
// Accepts: "L1" | "L2" | "L3" | "L4" | "FAIL" | "-" | null/undefined
export default function RP22GradingPill({ level, className = "" }) {
  const key = (typeof level === "string" ? level : "").toUpperCase();

  const styles = {
    L4: { bg: "bg-[#1F3B2C]", text: "text-white", border: "border-[#1F3B2C]" },
    L3: { bg: "bg-[#2E3A45]", text: "text-white", border: "border-[#2E3A45]" },
    L2: { bg: "bg-[#6A5A45]", text: "text-white", border: "border-[#6A5A45]" },
    L1: { bg: "bg-[#4A2B1C]", text: "text-white", border: "border-[#4A2B1C]" },

    FAIL: { bg: "bg-black", text: "text-white", border: "border-black" },

    // Anything unknown (including "-" or empty) becomes a neutral pill
    DEFAULT: { bg: "bg-transparent", text: "text-[#3E4349]", border: "border-[#D9D9D9]" },
  };

  const style = styles[key] || styles.DEFAULT;

  // What we actually display inside the pill
  const label =
    key === "L1" || key === "L2" || key === "L3" || key === "L4" || key === "FAIL"
      ? key
      : "-";

  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold",
        style.bg,
        style.text,
        style.border,
        className,
      ].join(" ")}
    >
      {label}
    </span>
  );
}