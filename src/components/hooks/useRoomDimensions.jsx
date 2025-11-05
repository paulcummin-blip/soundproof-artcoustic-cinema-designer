
import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  getRoomDimensions, 
  setRoomDimensions,
  getSelectedSpeakers,
  setSelectedSpeakers as setSelectedSpeakersAdapter,
  getSpeakerNodes,
  setSpeakerNodes as setSpeakerNodesAdapter
} from '@/components/adapters/Base44EntityAdapter';

// Internal module state for cross-component sharing
let sharedState = {
  width_m: 0,
  length_m: 0,
  height_m: 0,
  volume_m3: 0,
  loaded: false,
  selectedSpeakersByRole: null,
  speakerNodes: null
};

let listeners = new Set();

function notifyListeners() {
  listeners.forEach(fn => fn(sharedState));
}

// Helper: round to 2 decimal places (centimetre precision)
function n2(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function updateSharedState(partial) {
  const newState = {
    ...sharedState,
    ...partial
  };
  
  // Recompute volume whenever dimensions change (use 2-decimal precision values)
  if ('width_m' in partial || 'length_m' in partial || 'height_m' in partial) {
    const w = n2(partial.width_m ?? sharedState.width_m);
    const l = n2(partial.length_m ?? sharedState.length_m);
    const h = n2(partial.height_m ?? sharedState.height_m);
    newState.width_m = w;
    newState.length_m = l;
    newState.height_m = h;
    newState.volume_m3 = w * l * h;
  }
  
  sharedState = newState;
  notifyListeners();
}

/**
 * Shared hook for room dimensions and speaker handoff with auto-persist
 * Now handles null projectId gracefully - falls back to localStorage
 * @param {string | null} projectId - optional project ID (can be null for local-only mode)
 * @returns {{dims: object, setDims: function, loadDims: function, loaded: boolean, hardPersist: function, selectedSpeakersByRole: object, setSelectedSpeakers: function, loadSelectedSpeakers: function, speakerNodes: array, setSpeakerNodes: function, loadSpeakerNodes: function}}
 */
export function useRoomDimensions(projectId) {
  const [localState, setLocalState] = useState(sharedState);
  const debounceTimerRef = useRef(null);
  const speakersDebounceTimerRef = useRef(null);
  const nodesDebounceTimerRef = useRef(null);
  const projectIdRef = useRef(projectId);

  // Keep ref updated
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Subscribe to shared state changes
  useEffect(() => {
    const listener = (newState) => setLocalState(newState);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  // Load dimensions from adapter - now handles null projectId
  const loadDims = useCallback(async (pId) => {
    try {
      // Adapter handles null projectId by falling back to localStorage
      const dims = await getRoomDimensions(pId || projectIdRef.current);
      if (dims) {
        updateSharedState({ 
          width_m: n2(dims.width_m),
          length_m: n2(dims.length_m),
          height_m: n2(dims.height_m),
          loaded: true 
        });
      } else {
        // No stored dims, use defaults but mark as loaded
        updateSharedState({ width_m: 4.0, length_m: 6.0, height_m: 2.4, loaded: true });
      }
    } catch (err) {
      console.warn('[useRoomDimensions] Load failed:', err);
      // Mark as loaded even on error to prevent blocking
      updateSharedState({ loaded: true });
    }
  }, []);

  // Load selected speakers from adapter - handles null projectId
  const loadSelectedSpeakers = useCallback(async (pId) => {
    try {
      const speakers = await getSelectedSpeakers(pId || projectIdRef.current);
      updateSharedState({ selectedSpeakersByRole: speakers });
    } catch (err) {
      console.warn('[useRoomDimensions] Load speakers failed:', err);
    }
  }, []);

  // Load speaker nodes from adapter - handles null projectId
  const loadSpeakerNodes = useCallback(async (pId) => {
    try {
      const nodes = await getSpeakerNodes(pId || projectIdRef.current);
      updateSharedState({ speakerNodes: nodes });
    } catch (err) {
      console.warn('[useRoomDimensions] Load nodes failed:', err);
    }
  }, []);

  // Debounced persist for dimensions
  const persistDebounced = useCallback((dims) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(async () => {
      try {
        await setRoomDimensions(dims, projectIdRef.current);
      } catch (err) {
        console.warn('[useRoomDimensions] Persist failed:', err);
      }
    }, 300);
  }, []);

  // Debounced persist for selected speakers
  const persistSpeakersDebounced = useCallback((speakers) => {
    if (speakersDebounceTimerRef.current) {
      clearTimeout(speakersDebounceTimerRef.current);
    }
    
    speakersDebounceTimerRef.current = setTimeout(async () => {
      try {
        await setSelectedSpeakersAdapter(speakers, projectIdRef.current);
      } catch (err) {
        console.warn('[useRoomDimensions] Persist speakers failed:', err);
      }
    }, 300);
  }, []);

  // Debounced persist for speaker nodes
  const persistNodesDebounced = useCallback((nodes) => {
    if (nodesDebounceTimerRef.current) {
      clearTimeout(nodesDebounceTimerRef.current);
    }
    
    nodesDebounceTimerRef.current = setTimeout(async () => {
      try {
        await setSpeakerNodesAdapter(nodes, projectIdRef.current);
      } catch (err) {
        console.warn('[useRoomDimensions] Persist nodes failed:', err);
      }
    }, 300);
  }, []);

  // Immediate persist (flush debounce)
  const hardPersist = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    try {
      const { width_m, length_m, height_m } = sharedState;
      await setRoomDimensions({ width_m, length_m, height_m }, projectIdRef.current);
    } catch (err) {
      console.warn('[useRoomDimensions] Hard persist failed:', err);
    }
  }, []);

  // Set dimensions (optimistic + debounced persist)
  const setDims = useCallback((partial) => {
    // Guard: if not loaded yet and all values are zero/empty, ignore
    if (!sharedState.loaded) {
      const isAllZero = Object.entries(partial).every(([key, val]) => {
        return val === 0 || val === null || val === undefined || val === '';
      });
      if (isAllZero) {
        return; // Ignore pre-load default writes
      }
    }
    
    const newDims = {
      width_m: n2(partial.width_m ?? sharedState.width_m),
      length_m: n2(partial.length_m ?? sharedState.length_m),
      height_m: n2(partial.height_m ?? sharedState.height_m)
    };
    
    updateSharedState(newDims);
    persistDebounced(newDims);
  }, [persistDebounced]);

  // Set selected speakers (optimistic + debounced persist)
  const setSelectedSpeakers = useCallback((partial) => {
    const newSpeakers = {
      ...sharedState.selectedSpeakersByRole,
      ...partial
    };
    
    updateSharedState({ selectedSpeakersByRole: newSpeakers });
    persistSpeakersDebounced(newSpeakers);
  }, [persistSpeakersDebounced]);

  // Set speaker nodes (optimistic + debounced persist)
  const setSpeakerNodes = useCallback((nodes) => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    
    updateSharedState({ speakerNodes: safeNodes });
    persistNodesDebounced(safeNodes);
  }, [persistNodesDebounced]);

  // Persist on blur/unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use synchronous localStorage write on unload
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const { width_m, length_m, height_m, selectedSpeakersByRole, speakerNodes } = sharedState;
          window.localStorage.setItem('Base44:lastRoomDimensions', JSON.stringify({ width_m, length_m, height_m }));
          if (selectedSpeakersByRole) {
            window.localStorage.setItem('Base44:selectedSpeakersByRole', JSON.stringify(selectedSpeakersByRole));
          }
          if (speakerNodes) {
            window.localStorage.setItem('Base44:speakerNodes', JSON.stringify(speakerNodes));
          }
        }
      } catch (err) {
        console.warn('[useRoomDimensions] beforeunload persist failed:', err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hardPersist();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      hardPersist(); // Flush on unmount
    };
  }, [hardPersist]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (speakersDebounceTimerRef.current) {
        clearTimeout(speakersDebounceTimerRef.current);
      }
      if (nodesDebounceTimerRef.current) {
        clearTimeout(nodesDebounceTimerRef.current);
      }
    };
  }, []);

  return {
    dims: {
      width_m: localState.width_m,
      length_m: localState.length_m,
      height_m: localState.height_m,
      volume_m3: localState.volume_m3
    },
    setDims,
    loadDims,
    loaded: localState.loaded,
    hardPersist,
    selectedSpeakersByRole: localState.selectedSpeakersByRole,
    setSelectedSpeakers,
    loadSelectedSpeakers,
    speakerNodes: localState.speakerNodes,
    setSpeakerNodes,
    loadSpeakerNodes
  };
}
