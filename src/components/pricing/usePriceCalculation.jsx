// components/pricing/usePriceCalculation.jsx
import { useMemo } from 'react';
import { artcousticSpeakers } from '@/components/data/speakerData';

/**
 * Lookup speaker price from speakerData by model ID.
 * Returns 0 if price is missing (with console warning).
 */
function getSpeakerPrice(modelId) {
  if (!modelId || modelId === 'off' || modelId === 'OFF') return 0;
  
  const normalized = String(modelId).toLowerCase().replace(/[-_\s]/g, '');
  
  const speaker = artcousticSpeakers.find(s => {
    const entryNorm = String(s.model || s.id || '').toLowerCase().replace(/[-_\s]/g, '');
    return entryNorm === normalized || s.id === modelId;
  });
  
  if (!speaker) {
    const _missingWarned = globalThis.__missingSpeakerWarned || (globalThis.__missingSpeakerWarned = new Set());
    if (!_missingWarned.has(modelId)) {
      _missingWarned.add(modelId);
      console.warn(`[Pricing] Speaker not found in database: ${modelId}`);
    }
    return 0;
  }
  
  const price = Number(speaker.price);
  if (!Number.isFinite(price) || price <= 0) {
    console.warn(`[Pricing] Missing or invalid price for ${modelId}`);
    return 0;
  }
  
  return price;
}

/**
 * Calculate total room hardware price from placed speakers.
 * Returns { baseTotal, breakdown } where breakdown is an array of { role, model, price, count }.
 */
export function usePriceCalculation({
  placedSpeakers = [],
  frontSubsCfg = null,
  rearSubsCfg = null,
  difficultyMultiplier = 1.0,
}) {
  return useMemo(() => {
    const breakdown = [];
    let baseTotal = 0;
    
    // Count speakers by model
    const speakersByModel = new Map();
    
    // Process placed speakers (LCR, surrounds, overheads)
    for (const spk of placedSpeakers) {
      if (!spk?.model || spk.model === 'off') continue;
      
      const role = String(spk.role || '').toUpperCase();
      // Skip LFE (not a physical speaker we price)
      if (role === 'LFE') continue;
      
      const model = String(spk.model);
      const price = getSpeakerPrice(model);
      
      if (!speakersByModel.has(model)) {
        speakersByModel.set(model, {
          model,
          price,
          count: 0,
          roles: [],
        });
      }
      
      const entry = speakersByModel.get(model);
      entry.count += 1;
      entry.roles.push(role);
      baseTotal += price;
    }
    
    // Process front subs
    if (frontSubsCfg?.model && frontSubsCfg?.count > 0) {
      const model = frontSubsCfg.model;
      const price = getSpeakerPrice(model);
      const count = Number(frontSubsCfg.count) || 0;
      
      if (!speakersByModel.has(model)) {
        speakersByModel.set(model, {
          model,
          price,
          count: 0,
          roles: [],
        });
      }
      
      const entry = speakersByModel.get(model);
      entry.count += count;
      entry.roles.push('SUB (Front)');
      baseTotal += price * count;
    }
    
    // Process rear subs
    if (rearSubsCfg?.model && rearSubsCfg?.count > 0) {
      const model = rearSubsCfg.model;
      const price = getSpeakerPrice(model);
      const count = Number(rearSubsCfg.count) || 0;
      
      if (!speakersByModel.has(model)) {
        speakersByModel.set(model, {
          model,
          price,
          count: 0,
          roles: [],
        });
      }
      
      const entry = speakersByModel.get(model);
      entry.count += count;
      entry.roles.push('SUB (Rear)');
      baseTotal += price * count;
    }
    
    // Convert map to array for breakdown
    speakersByModel.forEach((entry) => {
      breakdown.push({
        model: entry.model,
        price: entry.price,
        count: entry.count,
        subtotal: entry.price * entry.count,
        roles: entry.roles.join(', '),
      });
    });
    
    // Apply difficulty multiplier
    const multiplier = Number.isFinite(difficultyMultiplier) && difficultyMultiplier > 0 
      ? difficultyMultiplier 
      : 1.0;
    const finalTotal = baseTotal * multiplier;
    
    return {
      baseTotal,
      finalTotal,
      difficultyMultiplier: multiplier,
      breakdown,
    };
  }, [placedSpeakers, frontSubsCfg, rearSubsCfg, difficultyMultiplier]);
}