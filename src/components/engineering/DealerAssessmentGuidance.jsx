/**
 * DealerAssessmentGuidance
 * -------------------------
 * Dealer-facing explanation shown in the Room Designer when engineering
 * publication is blocked because mandatory system equipment is still missing.
 *
 * The internal `EngineeringPublicationStatus` row is hidden from dealers, which
 * left them unable to understand why the Technical Report reads "Not verified"
 * while partial calculations still appear in the seat HUD. This component fills
 * that gap with a concise, plain-English explanation naming the actual missing
 * items — derived from the existing readiness/preflight authority, never
 * hardcoded.
 *
 * Rules:
 *   · Shown only for dealer (non-internal) users. Internal audiences keep the
 *     existing engineering status row; this never duplicates it.
 *   · Shown only when publication is NOT ready AND the block is missing
 *     equipment. Non-equipment blocks (e.g. bass still settling) stay silent —
 *     the existing automatic workflow resolves them.
 *   · No retry button while mandatory equipment is missing.
 *   · Clearly distinguishes partial live calculations from a completed
 *     published assessment.
 *   · Auto-clears the moment the missing requirements are satisfied.
 *   · Once the design is complete, the existing automatic assessment /
 *     publication workflow is untouched.
 */

import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useEngineeringMode } from '@/components/state/useEngineeringMode';
import { deriveMissingSystemItems } from './deriveMissingSystemItems';

function composeSentence(missing) {
  if (missing.length === 0) return '';
  const lead = 'Complete your system to generate the Technical Report.';
  const actions = missing.map((item) => {
    if (item === 'front left, centre and right speakers') return `add your ${item}`;
    if (item === 'surround speakers') return `add your ${item}`;
    if (item === 'overhead speaker models') return `select your ${item}`;
    if (item === 'subwoofer system') return `configure your ${item}`;
    return `complete your ${item}`;
  });
  let list;
  if (actions.length === 1) {
    list = actions[0];
  } else if (actions.length === 2) {
    list = `${actions[0]} and ${actions[1]}`;
  } else {
    list = `${actions.slice(0, -1).join(', ')}, and ${actions[actions.length - 1]}`;
  }
  return `${lead} ${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
}

export default function DealerAssessmentGuidance({
  publication,
  placedSpeakers,
  appState,
  dolbyLayout,
  useWidesInsteadOfRears = false,
}) {
  const { user } = useAuth();
  const { engineeringMode } = useEngineeringMode();

  // Internal audiences (Engineering Mode or a true non-account-scoped master
  // admin) see the existing EngineeringPublicationStatus row instead — this
  // component never duplicates it for them.
  const accountScoped = Boolean(
    user?.access_context?.account?.id || user?.access_context?.user?.account_id,
  );
  const internalAudience = engineeringMode === true
    || (user?.access_context?.capabilities?.masterAdmin === true && !accountScoped);
  if (internalAudience) return null;

  const preflight = publication?.preflight;
  // Auto-clear: a ready assessment needs no guidance.
  if (!preflight || preflight.ready) return null;

  const missingItems = deriveMissingSystemItems({
    placedSpeakers,
    subwoofers: appState?.subwoofers,
    subwooferInstances: appState?.subwooferInstances,
    dolbyLayout,
    useWidesInsteadOfRears,
  });
  // Blocked for a non-equipment reason (e.g. bass still settling): stay silent
  // and let the existing automatic workflow resolve it.
  if (missingItems.length === 0) return null;

  const sentence = composeSentence(missingItems);

  return (
    <section
      className="rounded-lg border border-[#E2D7BE] bg-[#F7F1E6] px-3 py-2 mb-3"
      aria-label="Complete your system to generate the Technical Report"
    >
      <p className="text-sm" style={{ color: '#213428', lineHeight: 1.5 }}>
        <strong>Assessment not started.</strong> {sentence}
      </p>
      <p className="mt-1 text-xs" style={{ color: '#7A6640' }}>
        Any values shown in the meantime are live previews, not a verified assessment.
      </p>
    </section>
  );
}