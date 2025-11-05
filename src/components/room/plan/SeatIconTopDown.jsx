import React from "react";

/**
 * A lightweight top-down "person sitting" icon.
 * - viewBox 48x48 for simple scaling
 * - stroke-only so it stays crisp at any zoom
 */
export default function SeatIconTopDown({
  size = 28,             // rendered size in px (screen pixels)
  stroke = "#213428",    // outline color
  fill = "transparent",  // optional fill; keep transparent for line-art look
  strokeWidth = 2,
  muted = false,         // use a softer tint for non-primary seats
}) {
  const outline = muted ? "#6B6258" : stroke;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      style={{ display: "block" }}
    >
      <g fill={fill} stroke={outline} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {/* head */}
        <circle cx="14" cy="16" r="6" />
        {/* backrest (behind) */}
        <rect x="10" y="10" width="4" height="28" rx="2" />
        {/* seat pan */}
        <rect x="16" y="18" width="18" height="10" rx="3" />
        {/* right arm */}
        <path d="M16 20 L8 20" />
        {/* left arm */}
        <path d="M34 20 L42 20" />
        {/* torso to seat */}
        <path d="M14 22 C16 24, 18 25, 20 25" />
        {/* right leg */}
        <path d="M25 28 L25 38 L28 44" />
        {/* left leg */}
        <path d="M30 28 L30 38 L33 44" />
        {/* small foot hints */}
        <line x1="27" y1="44" x2="31" y2="44" />
      </g>
    </svg>
  );
}