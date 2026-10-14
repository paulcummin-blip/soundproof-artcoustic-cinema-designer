import React from 'react';
import { steerPayload } from '@/components/proposal/wizard/narrativeSteer';

/**
 * The narrative steer as the review step reads it.
 *
 * Two short lines and nothing else: the subjects the designer asked to be weighed
 * more heavily, and the subjects they asked to leave out. They are printed as
 * TOPIC NAMES — "Tonal consistency", "Bass performance" — never as instructions,
 * bullets or writing requirements, because that is exactly what they are not: a
 * preference is an ingredient the writer may use as it tells the project's story,
 * and a topic left out is kept out of the client-facing narrative.
 *
 * NEUTRAL TOPICS ARE NOT LISTED. A topic the designer left alone is not an
 * instruction to anyone, so showing it here would read as one. A steer with
 * nothing preferred and nothing excluded renders nothing at all.
 */
export default function NarrativeSteerReview({ steer = {}, className = '' }) {
  const payload = steerPayload(steer);
  const preferred = payload.preferred_topics.map((entry) => entry.topic);
  const excluded = payload.excluded_topics.map((entry) => entry.topic);
  if (preferred.length === 0 && excluded.length === 0) return null;

  return (
    <div className={`border-t border-[#E5E1D8] pt-4 ${className}`}>
      <div
        className="text-[11px] uppercase tracking-[0.14em] text-[#A79E8C] mb-3"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        Narrative Steer
      </div>
      {preferred.length > 0 && (
        <SteerLine label="Prefer" topics={preferred} />
      )}
      {excluded.length > 0 && (
        <SteerLine label="Do not discuss" topics={excluded} mutedValues />
      )}
    </div>
  );
}

/** One line of the steer: its state, then the topic names it covers. */
function SteerLine({ label, topics = [], mutedValues = false }) {
  return (
    <div className="flex items-start gap-6 py-1">
      <span className="text-[11px] uppercase tracking-[0.12em] text-[#8A8477] pt-0.5 whitespace-nowrap">
        {label}
      </span>
      <span
        className={`text-sm leading-relaxed ${mutedValues ? 'text-[#8A8477]' : 'text-[#1B1A1A]'}`}
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        {topics.join(' · ')}
      </span>
    </div>
  );
}