/**
 * LcrAcousticCentreField
 *
 * The LCR acoustic-centre height input — the front stage's own use of the ONE
 * movement interaction the surround controls already use. It is not a second
 * system: it reads the same shared movement authority, so the drawing and the
 * panel can never disagree about what is moving or how high it is.
 *
 * While the speakers it governs are moving — dragged in Front Elevation, or
 * typed here — the value turns bold Artcoustic dark green behind the field's own
 * thin green border and the field is never dimmed, and the light holds for five
 * seconds after the movement stops. Nothing is boxed or outlined.
 *
 * A drag publishes its live position, so the field shows the height the designer
 * can see, continuously, to two decimals. Display only: the stored value stays
 * the project's own and is written once, on release, by the existing commit.
 */
import React from "react";
import StepperInput from "@/components/ui/StepperInput";
import {
  beginSpeakerHighlight,
  settleSpeakerHighlight,
  useSpeakerHighlighted,
  useLiveSpeakerPositionForRoles,
} from "@/components/state/speakerSelectionStore";

export default function LcrAcousticCentreField({
  roles,
  valueM,
  onChange,
  step = 0.01,
  minM = 0.2,
  maxM = Infinity,
  disabled = false,
}) {
  const lit = useSpeakerHighlighted(roles);

  // The height the designer is watching: while one of these speakers is being
  // dragged, this is where it is being dragged to, right now.
  const live = useLiveSpeakerPositionForRoles(roles);
  const liveZ = live && Number.isFinite(Number(live.z)) ? Number(live.z) : null;

  return (
    <StepperInput
      // The live height while the speaker moves, the stored value otherwise.
      value={liveZ ?? (Number(valueM) || 0)}
      step={step}
      min={minM}
      max={maxM}
      disabled={disabled}
      highlighted={lit}
      // Editing is movement: the light comes on as the field is used and its
      // hold starts when the designer leaves it — exactly as the surround
      // fields behave.
      onFocus={() => beginSpeakerHighlight(roles)}
      onBlur={() => settleSpeakerHighlight()}
      onChange={onChange}
    />
  );
}