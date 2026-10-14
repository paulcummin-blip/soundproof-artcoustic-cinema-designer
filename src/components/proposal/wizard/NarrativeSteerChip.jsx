import React from 'react';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import { STEER_STATE, STEER_STATE_LABEL } from '@/components/proposal/wizard/narrativeSteer';

/**
 * One narrative-steer topic, in its three states.
 *
 * A topic is a SUBJECT the proposal may cover, never a command: the chip reads
 * "Bass extension", never "Highlight the bass extension". The state supplies the
 * instruction, and clicking a chip moves it to the next state:
 *
 *   Neutral          ADI decides whether the topic is useful.
 *   Prefer           give it more weight if it fits naturally.
 *   Do not discuss   keep it out of the client-facing narrative.
 *
 * The chip is a plain button with an accessible description of its state, so the
 * same control works in the wizard and anywhere else a topic is offered.
 */
export default function NarrativeSteerChip({
  label,
  state = STEER_STATE.NEUTRAL,
  reason = '',
  suggested = false,
  onCycle,
  disabled = false,
}) {
  const styling = state === STEER_STATE.PREFER
    ? 'bg-[#213428] text-white border-[#213428] font-semibold'
    : state === STEER_STATE.EXCLUDE
      ? 'bg-white text-[#8A5A2B] border-[#C9A57A] font-semibold line-through decoration-[#C9A57A]'
      : suggested
        ? 'bg-[#F5F4F0] text-[#3E4349] border-[#CFC7B4] hover:bg-[#EFEDE6]'
        : 'bg-[#F5F4F0] text-[#3E4349] border-[#E5E1D8] hover:bg-[#EFEDE6]';

  const description = [
    `${label}: ${STEER_STATE_LABEL[state]}.`,
    state === STEER_STATE.NEUTRAL ? 'ADI decides whether it is useful.' : '',
    state === STEER_STATE.PREFER ? 'Given more weight if it fits naturally.' : '',
    state === STEER_STATE.EXCLUDE ? 'Kept out of the client-facing narrative.' : '',
    suggested && state === STEER_STATE.NEUTRAL ? 'ADI suggests this topic for this design.' : '',
    'Click to change.',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      aria-pressed={state !== STEER_STATE.NEUTRAL}
      aria-label={description}
      title={[description, reason].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={() => onCycle?.()}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]/40 focus-visible:ring-offset-1 disabled:opacity-60 ${styling}`}
    >
      {state === STEER_STATE.EXCLUDE
        ? <Minus className="w-3 h-3" />
        : state === STEER_STATE.PREFER
          ? <ChevronRight className="w-3 h-3" />
          : suggested
            ? <Plus className="w-3 h-3 text-[#A79E8C]" />
            : null}
      {label}
      {suggested && state === STEER_STATE.NEUTRAL && (
        <span className="text-[10px] uppercase tracking-[0.08em] text-[#A79E8C]">suggested</span>
      )}
    </button>
  );
}