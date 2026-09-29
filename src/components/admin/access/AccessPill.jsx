import React from "react";

// Shared status pill for the admin account-access surface.
// Tones are literal Tailwind class strings so the build keeps them.
const TONE_CLASSES = {
  ok: "border-[#BBD3C4] bg-[#EEF4F0] text-[#213428]",
  warn: "border-[#E4D6BE] bg-[#FAF5EC] text-[#7A5B22]",
  danger: "border-[#E7C5C5] bg-[#FBEDED] text-[#8F2F2F]",
  info: "border-[#C7D5E8] bg-[#EFF3F9] text-[#2C5AA0]",
  muted: "border-[#DCDBD6] bg-[#F7F7F5] text-[#625143]",
};

export default function AccessPill({ label, tone = "muted", title = undefined, className = "" }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[tone] || TONE_CLASSES.muted} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}