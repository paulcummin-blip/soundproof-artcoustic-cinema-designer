import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HIGHLIGHT_GREEN,
  useSpeakerHighlighted,
  useLiveSpeakerPositionForRoles,
  beginSpeakerHighlight,
  settleSpeakerHighlight,
} from "@/components/state/speakerSelectionStore";

/**
 * One group's Acoustic Centre Height (m) — the vertical centre of the speaker
 * cabinet, measured from the finished floor.
 *
 * The field is a view of the speakers themselves: it shows the value the
 * installed speakers of that group actually hold and writes a typed value
 * straight back to them, so the panel and the drawing can never disagree.
 * `mixed` reports a group whose speakers stand at different heights.
 *
 * While the speakers it governs are moving — dragged in the elevation, or typed
 * here — the value turns bold Artcoustic dark green behind the field's own thin
 * green border, and holds for five seconds after the movement stops. Nothing is
 * boxed, outlined or permanently marked: the existing field simply reads as
 * active, and then quietly returns to normal.
 *
 * A drag in the elevation publishes its live position, so the field shows the
 * height the designer can see, continuously, while they move the speaker — to
 * two decimals. Display only: the stored value stays the project's own and is
 * written once, on release.
 */
export default function AcousticCentreHeightField({
  group = null,
  label,
  valueM = null,
  mixed = false,
  defaultM = null,
  minM = null,
  maxM = null,
  disabled = false,
  lightRoles = [],
  onEngage = null,
  onChange,
}) {
  const asText = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "");
  const [text, setText] = useState(() => asText(valueM));
  const [editing, setEditing] = useState(false);

  // While the field is being typed into it keeps the designer's own text; the
  // stored value takes over again on blur, so a clamped value reads back true.
  useEffect(() => {
    if (!editing) setText(asText(valueM));
  }, [valueM, editing]);

  // The light is shared with the elevation: these speakers are green whenever
  // they are moving, whichever end started the movement.
  const lit = useSpeakerHighlighted(lightRoles);

  // The height the designer is watching: while one of these speakers is being
  // dragged, this is where it is being dragged to, right now.
  const live = useLiveSpeakerPositionForRoles(lightRoles);
  const liveZ = live && Number.isFinite(Number(live.z)) ? Number(live.z) : null;

  const numericMin = Number.isFinite(Number(minM)) ? Number(minM) : null;

  const commit = (raw) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || typeof onChange !== "function") return;
    // A partly typed number ("0" on the way to "0.60") never moves the speaker.
    if (numericMin !== null && parsed < numericMin) return;
    onChange(parsed);
  };

  // Pointing at this control selects its speakers in the drawing, so the panel
  // and the elevation are one interface rather than two.
  const engage = () => {
    if (typeof onEngage === "function") onEngage();
  };

  // Editing is movement: the light comes on with the edit and the hold starts
  // when editing finishes. Further typing restarts nothing — it simply stays on
  // while the speakers are being moved.
  const beginEdit = () => beginSpeakerHighlight(lightRoles);
  const endEdit = () => settleSpeakerHighlight();

  return (
    <div
      id={group ? `acoustic-centre-${group}` : undefined}
      onPointerDown={engage}
      onFocus={engage}
      className="space-y-1.5 rounded-md"
    >
      <Label
        className="text-xs font-medium transition-colors duration-500 ease-out"
        style={{ color: lit ? HIGHLIGHT_GREEN : "#3E4349" }}
      >
        {label}
      </Label>
      <div className="relative">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          min={numericMin === null ? undefined : numericMin.toFixed(2)}
          max={Number.isFinite(Number(maxM)) ? Number(maxM).toFixed(2) : undefined}
          value={editing ? text : asText(liveZ ?? valueM)}
          placeholder={mixed ? "Mixed" : asText(defaultM)}
          disabled={disabled}
          onFocus={() => {
            setEditing(true);
            beginEdit();
          }}
          onChange={(event) => {
            setText(event.target.value);
            commit(event.target.value);
            beginEdit();
          }}
          onBlur={(event) => {
            setEditing(false);
            commit(event.target.value);
            setText(asText(valueM));
            endEdit();
          }}
          className="pr-8 bg-white transition-colors duration-500 ease-out"
          style={{
            color: lit ? HIGHLIGHT_GREEN : "#1B1A1A",
            fontWeight: lit ? 700 : 400,
            borderColor: lit ? HIGHLIGHT_GREEN : undefined,
          }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none">
          m
        </span>
      </div>
    </div>
  );
}