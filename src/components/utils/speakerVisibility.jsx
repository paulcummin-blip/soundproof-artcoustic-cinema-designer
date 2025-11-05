/**
 * Safe speaker visibility helpers for layout-based filtering
 * Stage B: Crash-proof array operations and visibility rules
 */

// --- SAFE ARRAY HELPERS ---
export const asArray = (v) => (Array.isArray(v) ? v : []);
export const len = (v) => (Array.isArray(v) ? v.length : 0);

/**
 * Filter speakers to only those visible in the current layout
 * @param {Array} speakers - Raw speaker array (may be undefined)
 * @param {Function} visibilityChecker - getSpeakerVisibility from AppState
 * @returns {Array} Filtered, safe array
 */
export function getVisibleSpeakers(speakers, visibilityChecker) {
  const src = asArray(speakers);
  if (!src.length) return [];
  
  const checker = typeof visibilityChecker === 'function' 
    ? visibilityChecker 
    : (() => true);
  
  return src.filter((s) => {
    const role = (s?.role || '').toUpperCase();
    return checker(role);
  });
}

/**
 * Get visible surround speakers only (for angles/P5)
 * @param {Array} visibleSpeakers - Already filtered speaker list
 * @returns {Array} Surrounds only
 */
export function getVisibleSurrounds(visibleSpeakers) {
  const src = asArray(visibleSpeakers);
  return src.filter((s) => {
    const r = (s?.role || '').toUpperCase();
    return r === 'SL' || r === 'SR' || r === 'SBL' || r === 'SBR' || r === 'LW' || r === 'RW';
  });
}