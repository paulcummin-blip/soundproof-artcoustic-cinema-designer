// BassAuthorityStateBar — the explicit state of the bass result band, with the
// one action that resolves it.
//
// PRESENTATION ONLY. It renders the state the shared authority resolved and
// calls back for the single action that state needs — Calculate Bass
// Performance, or Save Assessment. It computes nothing, changes no value, and
// holds no state of its own.
import React from "react";
import { BASS_AUTHORITY_STATE } from "@/components/room/bass/bassAuthorityState";

const TONES = {
  [BASS_AUTHORITY_STATE.CURRENT]: { color: "#213428", background: "#EAF3EC", border: "#B7D3BE" },
  [BASS_AUTHORITY_STATE.PUBLISHING]: { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" },
  [BASS_AUTHORITY_STATE.PREVIEW_ONLY]: { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" },
  [BASS_AUTHORITY_STATE.NEEDS_CALCULATION]: { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" },
  [BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED]: { color: "#3E4349", background: "#F8F8F7", border: "#DCDBD6" },
  [BASS_AUTHORITY_STATE.CALCULATING]: { color: "#3E4349", background: "#F8F8F7", border: "#DCDBD6" },
};

// The one attention tone: used only for the single status when something needs
// attention, never repeated on the individual parameter results.
const ATTENTION_TONE = { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" };

export default function BassAuthorityStateBar({ state = null, onPrimaryAction = null, primaryDisabled = false }) {
  if (!state?.label) return null;
  const tone = state.attention
    ? ATTENTION_TONE
    : (TONES[state.code] || TONES[BASS_AUTHORITY_STATE.NEEDS_CALCULATION]);
  const showAction = !!state.actionLabel && typeof onPrimaryAction === "function";

  return (
    <div
      data-bass-authority-state={state.code}
      className="col-span-2 sm:col-span-4 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-2.5 py-2"
      style={{ border: `1px solid ${tone.border}`, background: tone.background }}
    >
      <span
        className="font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0"
        style={{ fontSize: "9px", color: tone.color, border: `1px solid ${tone.border}`, background: "rgba(255,255,255,0.6)" }}
      >
        {state.label}
      </span>
      {state.message && (
        <span className="min-w-0 flex-1" style={{ fontSize: "11.5px", color: "#3E4349", lineHeight: 1.4 }}>
          {state.message}
        </span>
      )}
      {showAction && (
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={primaryDisabled}
          className="shrink-0 rounded-md px-3 py-1.5 font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          style={{ fontSize: "12px", background: "#213428", color: "#FFFFFF" }}
        >
          {state.actionLabel}
        </button>
      )}
    </div>
  );
}