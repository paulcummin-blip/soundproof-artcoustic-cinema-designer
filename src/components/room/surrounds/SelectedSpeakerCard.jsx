import React from "react";

/**
 * SelectedSpeakerCard — what the designer has selected, in words and figures.
 *
 * Sits at the top of the surround controls so the selection is always named:
 * one speaker picked in the elevation reads back its role, model, acoustic
 * centre height and position; one group control names the group it governs and
 * what it governs. The highlighted control below is the editor, so the panel
 * and the drawing read as one interface rather than two.
 *
 * Read-only: it displays stored values and edits nothing.
 */
const metres = (value) => (Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} m` : "—");

function Figure({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-[#625143]">{label}</span>
      <span className="text-xs font-semibold text-[#1B1A1A]">{value}</span>
    </div>
  );
}

export default function SelectedSpeakerCard({
  role = null,
  model = null,
  acousticCentreM = null,
  positionY = null,
  wall = null,
  groupLabel = null,
  groupRoles = [],
  groupValueM = null,
  groupMixed = false,
}) {
  if (!role && !groupLabel) return null;

  const position = Number.isFinite(Number(positionY))
    ? `${metres(positionY)} from front wall${wall ? ` · ${wall}` : ""}`
    : "—";

  return (
    <div className="rounded-md border border-[#213428]/30 bg-[#F4F6F4] px-3 py-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold tracking-wide text-[#1B1A1A]">
          {role || groupLabel}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-[#625143]">
          {role ? "Selected speaker" : "Group control"}
        </span>
      </div>

      {role ? (
        <div className="grid grid-cols-3 gap-2">
          <Figure label="Model" value={model || "—"} />
          <Figure label="Acoustic centre" value={metres(acousticCentreM)} />
          <Figure label="Position" value={position} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Speakers" value={groupRoles.length ? groupRoles.join(", ") : "—"} />
          <Figure
            label="Acoustic centre"
            value={groupMixed ? "Mixed" : metres(groupValueM)}
          />
        </div>
      )}

      <p className="text-[11px] leading-tight text-[#625143]">
        {role
          ? "The control below adjusts this speaker. Its text turns dark green while the speaker is moved, then returns to normal. Individual heights set here are kept."
          : "These speakers move together, and their text turns dark green while they move. A height set on one speaker in the drawing stays with it."}
      </p>
    </div>
  );
}