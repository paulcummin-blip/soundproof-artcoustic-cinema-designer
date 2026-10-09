// BassStateBadge — the state of the bass result, named in the shared
// vocabulary, for any surface that shows a P14 / P18 / P19 / P20 value.
//
// PRESENTATION ONLY: it renders the state it is handed and decides nothing.
// The state always comes from useSharedBassAuthorityState, so every badge on
// screen says the same thing as the authority band.
import React from "react";
import { BASS_AUTHORITY_STATE } from "@/components/room/bass/bassAuthorityState";

const TONES = {
  [BASS_AUTHORITY_STATE.CURRENT]: { color: "#213428", background: "#EAF3EC", border: "#B7D3BE" },
  [BASS_AUTHORITY_STATE.PUBLISHING]: { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" },
  [BASS_AUTHORITY_STATE.PREVIEW_ONLY]: { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" },
  [BASS_AUTHORITY_STATE.NEEDS_CALCULATION]: { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" },
  [BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED]: { color: "#92400E", background: "#FEF3C7", border: "#FCD34D" },
  [BASS_AUTHORITY_STATE.CALCULATING]: { color: "#3E4349", background: "#F8F8F7", border: "#DCDBD6" },
};

export default function BassStateBadge({ state = null, compact = false }) {
  if (!state?.label) return null;
  const tone = TONES[state.code] || TONES[BASS_AUTHORITY_STATE.NEEDS_CALCULATION];

  return (
    <span
      data-bass-authority-state={state.code}
      title={state.message || state.note || state.label}
      className="font-semibold uppercase tracking-wide rounded whitespace-nowrap"
      style={{
        fontSize: compact ? "9px" : "9.5px",
        padding: compact ? "1px 4px" : "1px 6px",
        color: tone.color,
        background: tone.background,
        border: `1px solid ${tone.border}`,
      }}
    >
      {state.label}
    </span>
  );
}