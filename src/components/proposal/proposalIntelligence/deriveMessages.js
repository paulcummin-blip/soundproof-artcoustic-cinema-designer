/**
 * deriveMessages.js
 * --------------------------------
 * Derive primary and secondary messages from engineering evidence and
 * product knowledge.
 *
 * Primary messages   = the three most important things to communicate.
 * Secondary messages  = supporting messages that not every project needs.
 *
 * Pure function. No GPT. No side effects. No invention.
 * Every message is traceable to a field in Engineering Authority or
 * Product Intelligence.
 */

import { withDecisionConfidence, confidenceFloor } from './confidence';

const LEVEL_NUMERIC = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0, 'N/A': null };

/**
 * Build candidate messages from engineering + product evidence, then rank
 * them by relevance to the narrative goal and return the top 3 as primary
 * messages and the remainder as secondary messages.
 */
export function deriveMessages({ engineeringAuthority, productIntelligence, engineeringFloor }) {
  const candidates = [
    ...deriveSystemMessages(engineeringAuthority),
    ...deriveBassMessages(engineeringAuthority),
    ...deriveRp22Messages(engineeringAuthority),
    ...deriveRoomMessages(engineeringAuthority),
    ...deriveProductMessages(productIntelligence),
  ];

  const narrativeGoal = engineeringAuthority?.metadata?.narrative_goal || 'luxury_cinema';
  const ranked = rankMessages(candidates, narrativeGoal);

  const primary = ranked.slice(0, 3).map((m, i) => ({
    rank: i + 1,
    message: m.message,
    why: m.why,
    evidence: m.evidence,
    ...withDecisionConfidence(m.confidence),
  }));

  const secondary = ranked.slice(3).map((m) => ({
    message: m.message,
    why: m.why,
    evidence: m.evidence,
    ...withDecisionConfidence(m.confidence),
  }));

  return { primary_messages: primary, secondary_messages: secondary };
}

function deriveSystemMessages(authority) {
  const system = authority?.system || {};
  const config = system.configuration || {};
  const messages = [];

  // Atmos overhead channels
  const overhead = config.overhead_channels || 0;
  if (overhead > 0) {
    messages.push({
      message: `Full Dolby Atmos immersion with ${overhead} overhead channel${overhead !== 1 ? 's' : ''}`,
      why: 'Overhead channels create a complete three-dimensional soundfield above the listener.',
      evidence: `system.configuration.overhead_channels = ${overhead} (${config.dolby_config || 'Atmos'})`,
      confidence: config.confidence || 0.99,
      category: 'system',
    });
  }

  // Bed channel count
  const bed = config.bed_channels || 0;
  if (bed >= 7) {
    messages.push({
      message: `${bed}-channel bed layer with side and rear surround envelopment`,
      why: 'A 7-channel bed layer provides rear surround content that 5-channel systems cannot.',
      evidence: `system.configuration.bed_channels = ${bed}`,
      confidence: config.confidence || 0.99,
      category: 'system',
    });
  }

  // Subwoofer strategy
  const subStrategy = system.subwoofer_strategy || {};
  const subCount = subStrategy.count || 0;
  if (subCount >= 4) {
    messages.push({
      message: `Four-subwoofer arrangement for seat-to-seat bass consistency`,
      why: 'Distributed subwoofers smooth room modes across all seating positions, not just the reference seat.',
      evidence: `system.subwoofer_strategy.count = ${subCount}`,
      confidence: subStrategy.confidence || 0.99,
      category: 'system',
    });
  } else if (subCount === 2) {
    messages.push({
      message: `Dual-subwoofer configuration for improved modal smoothing`,
      why: 'Two subwoofers reduce seat-to-seat bass variation compared to a single subwoofer.',
      evidence: `system.subwoofer_strategy.count = ${subCount}`,
      confidence: subStrategy.confidence || 0.99,
      category: 'system',
    });
  }

  return messages;
}

function deriveBassMessages(authority) {
  const bass = authority?.bass || {};
  const messages = [];

  if (!bass.available) return messages;

  const p19 = bass.p19 || {};
  const p20 = bass.p20 || {};
  const p18 = bass.p18 || {};

  if (p19.achieved_level && LEVEL_NUMERIC[p19.achieved_level] >= 3) {
    messages.push({
      message: `Smooth low-frequency response at the reference position (P19 ${p19.achieved_level})`,
      why: 'Bass smoothness at the reference seat is the foundation of believable low-end reproduction.',
      evidence: `bass.p19.achieved_level = ${p19.achieved_level}`,
      confidence: p19.confidence || 0.80,
      category: 'bass',
    });
  }

  if (p20.achieved_level && LEVEL_NUMERIC[p20.achieved_level] >= 3) {
    messages.push({
      message: `Consistent bass across all seating positions (P20 ${p20.achieved_level})`,
      why: 'Seat-to-seat consistency means every listener hears the same bass balance.',
      evidence: `bass.p20.achieved_level = ${p20.achieved_level}`,
      confidence: p20.confidence || 0.80,
      category: 'bass',
    });
  }

  if (p18.achieved_level && LEVEL_NUMERIC[p18.achieved_level] >= 3 && p18.design_hz) {
    messages.push({
      message: `Bass extension to ${p18.design_hz.toFixed(0)} Hz (P18 ${p18.achieved_level})`,
      why: 'Deep bass extension reaches the fundamental frequencies of cinema content.',
      evidence: `bass.p18.design_hz = ${p18.design_hz}, level = ${p18.achieved_level}`,
      confidence: p18.confidence || 0.80,
      category: 'bass',
    });
  }

  return messages;
}

function deriveRp22Messages(authority) {
  const rp22 = authority?.rp22 || {};
  const strengths = rp22.strengths || [];
  const messages = [];

  // Top RP22 strengths as messages
  for (const s of strengths.slice(0, 2)) {
    messages.push({
      message: `${s.title}: ${s.achieved_level}`,
      why: s.engineering_meaning?.statement || s.engineering_meaning || 'Achieved a high RP22 performance level.',
      evidence: `rp22.strengths: ${s.parameter_id} (${s.title}) = ${s.achieved_level}`,
      confidence: s.confidence || 0.85,
      category: 'rp22',
    });
  }

  return messages;
}

function deriveRoomMessages(authority) {
  const room = authority?.room || {};
  const messages = [];

  // Acoustic treatment
  const treatment = room.acoustic_treatment || {};
  if (treatment.enabled && treatment.quantity > 0) {
    messages.push({
      message: `Acoustically treated room with ${treatment.quantity} Artcoustic Abfuser panel${treatment.quantity !== 1 ? 's' : ''}`,
      why: 'Acoustic treatment controls early reflections and room reverberation for clearer dialogue and imaging.',
      evidence: `room.acoustic_treatment: enabled, ${treatment.quantity} panels`,
      confidence: treatment.confidence || 0.99,
      category: 'room',
    });
  }

  // Room classification (if notable)
  const classification = room.classification;
  if (classification?.statement && classification.statement.includes('golden ratio')) {
    messages.push({
      message: `Favourable golden-ratio room proportions`,
      why: 'Well-separated room modes make consistent bass easier to achieve.',
      evidence: `room.classification: ${classification.statement}`,
      confidence: classification.confidence || 0.95,
      category: 'room',
    });
  }

  // Screen
  const screen = room.screen || {};
  if (screen.size_inches && screen.size_inches >= 120) {
    messages.push({
      message: `${screen.size_inches}" reference-class screen`,
      why: 'A large-format screen at the correct viewing distance delivers the intended cinematic field of view.',
      evidence: `room.screen.size_inches = ${screen.size_inches}`,
      confidence: screen.confidence || 0.99,
      category: 'room',
    });
  }

  return messages;
}

function deriveProductMessages(productIntelligence) {
  const messages = [];
  if (!Array.isArray(productIntelligence)) return messages;

  for (const pi of productIntelligence) {
    if (!pi || pi.status !== 'complete') continue;
    const strengths = pi.strengths || [];
    if (strengths.length === 0) continue;

    // Pick the first strength as a product message
    messages.push({
      message: `${pi.identity?.name || 'Product'}: ${strengths[0].replace(/_/g, ' ')}`,
      why: pi.product_story || pi.engineering_purpose || 'Selected for its engineering strengths.',
      evidence: `product_intelligence.strengths: ${strengths[0]}`,
      confidence: 0.85, // Product Intelligence confidence is letter-based; use B as default
      category: 'product',
    });
  }

  return messages;
}

/** Rank messages by relevance to the narrative goal. */
function rankMessages(messages, narrativeGoal) {
  const priorityByGoal = {
    reference_performance: { rp22: 1, bass: 2, system: 3, room: 4, product: 5 },
    luxury_cinema: { system: 1, room: 2, product: 3, bass: 4, rp22: 5 },
    best_value: { system: 1, rp22: 2, bass: 3, room: 4, product: 5 },
    family_media_room: { system: 1, room: 2, product: 3, bass: 4, rp22: 5 },
    future_proof: { system: 1, product: 2, rp22: 3, bass: 4, room: 5 },
  };

  const priorities = priorityByGoal[narrativeGoal] || priorityByGoal.luxury_cinema;

  return messages
    .map((m) => ({ ...m, priority: priorities[m.category] || 5 }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (b.confidence || 0) - (a.confidence || 0);
    });
}