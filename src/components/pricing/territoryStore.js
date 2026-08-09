/**
 * territoryStore.js
 * --------------------------------
 * Single shared territory state for the Room Designer pricing system.
 *
 * One canonical territory selection is read by every pricing consumer
 * (OptionsPanel, PriceSummary, usePriceCalculation) so they never disagree.
 *
 * Default: "UK".
 *
 * The store is a plain external store (subscribe / getSnapshot / setSnapshot)
 * consumed via useSyncExternalStore — the same pattern as asdrVisibilityStore.
 */

import { useSyncExternalStore } from 'react';
import { DEFAULT_TERRITORY, getTerritoryConfig } from './territoryConfig';

const listeners = new Set();
let state = { territory: DEFAULT_TERRITORY };

export function getTerritory() {
  return state.territory;
}

export function getTerritoryState() {
  return state;
}

export function setTerritory(code) {
  if (state.territory === code) return;
  state = { territory: code };
  listeners.forEach((fn) => fn(state));
}

export function subscribeTerritory(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * React hook for consuming the canonical territory selection.
 * Returns { territory, config } where config is the full territory definition.
 */
export function useTerritory() {
  const territory = useSyncExternalStore(subscribeTerritory, getTerritory);
  return { territory, config: getTerritoryConfig(territory) };
}