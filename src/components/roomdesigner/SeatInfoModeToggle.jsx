import React from "react";

/**
 * SeatInfoModeToggle — the Plan View segmented control that decides what a seat
 * click does: open the seat's performance HUD, or show that seat's dimensions.
 *
 * One mode is active at a time and switching is immediate: nothing is loaded and
 * nothing is recalculated. Compact, brand-styled to sit with the other plan
 * toolbar controls.
 */

const MODES = [
  {
    key: 'hud',
    label: 'HUD',
    title: 'Click a seat to open its performance HUD',
  },
  {
    key: 'dimensions',
    label: 'Dimensions',
    title: 'Click a seat to show its distances to the side wall, rear wall and screen',
  },
];

export default function SeatInfoModeToggle({ value = 'hud', onChange }) {
  return (
    <div
      role="group"
      aria-label="Seat click mode"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 999,
        border: '1px solid #DCDBD6',
        background: '#F4F3F0',
      }}
    >
      {MODES.map((mode) => {
        const active = value === mode.key;
        return (
          <button
            key={mode.key}
            type="button"
            aria-pressed={active}
            title={mode.title}
            onClick={() => {
              if (!active) onChange?.(mode.key);
            }}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.2,
              cursor: active ? 'default' : 'pointer',
              color: active ? '#FFFFFF' : '#625143',
              background: active ? '#213428' : 'transparent',
              transition: 'background 140ms ease-out, color 140ms ease-out',
              fontFamily: 'inherit',
            }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}