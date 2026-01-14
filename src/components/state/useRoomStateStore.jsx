// components/state/useRoomStateStore.js
// Shared room state store with Base44 Entity fallback to localStorage persistence

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'b44_room_state_v1';
const STORAGE_VERSION = 1;

// Default room state structure
function getDefaultRoomState() {
  return {
    version: STORAGE_VERSION,
    activeRoomId: 'default',
    rooms: {
      default: {
        id: 'default',
        name: 'Room 1',
        updatedAt: new Date().toISOString(),
        room: { widthM: 6, lengthM: 8, heightM: 2.7 },
        screen: {},
        seats: [],
        speakers: [],
        subs: [],
        rp22: {
          perSeat: {},
          overall: {},
        },
      },
    },
  };
}

// Safe JSON parse with fallback
function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('[useRoomStateStore] JSON parse failed:', e);
    return fallback;
  }
}

// Load from localStorage (sync)
function loadFromLocalStorage() {
  try {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = safeParseJSON(stored, null);
    if (!parsed || parsed.version !== STORAGE_VERSION) return null;
    return parsed;
  } catch (e) {
    console.warn('[useRoomStateStore] localStorage load failed:', e);
    return null;
  }
}

// Save to localStorage (sync)
function saveToLocalStorage(state) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[useRoomStateStore] localStorage save failed:', e);
  }
}

// Shared store instance (singleton pattern for same-tab state)
let sharedState = null;
let subscribers = [];

function notifySubscribers(newState) {
  sharedState = newState;
  subscribers.forEach(cb => cb(newState));
}

export function useRoomStateStore() {
  // Initialize from localStorage or defaults
  const [state, setState] = useState(() => {
    if (sharedState) return sharedState;
    const loaded = loadFromLocalStorage();
    const initial = loaded || getDefaultRoomState();
    sharedState = initial;
    return initial;
  });

  // Subscribe to shared state changes
  useEffect(() => {
    const handleUpdate = (newState) => {
      setState(newState);
    };
    subscribers.push(handleUpdate);
    return () => {
      subscribers = subscribers.filter(cb => cb !== handleUpdate);
    };
  }, []);

  // Get active room
  const getActiveRoom = useCallback(() => {
    const roomId = state.activeRoomId || 'default';
    return state.rooms[roomId] || state.rooms.default || getDefaultRoomState().rooms.default;
  }, [state]);

  // Set entire room state (full replace)
  const setRoomState = useCallback((newState) => {
    if (!newState) return;
    saveToLocalStorage(newState);
    notifySubscribers(newState);
  }, []);

  // Update room state with partial patch
  const updateRoomState = useCallback((patch) => {
    const roomId = state.activeRoomId || 'default';
    const currentRoom = state.rooms[roomId] || getDefaultRoomState().rooms.default;
    
    const updatedRoom = {
      ...currentRoom,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    const newState = {
      ...state,
      rooms: {
        ...state.rooms,
        [roomId]: updatedRoom,
      },
    };

    saveToLocalStorage(newState);
    notifySubscribers(newState);
  }, [state]);

  // Update RP22 results (per-seat or overall)
  const updateRP22Results = useCallback((perSeat = null, overall = null) => {
    const roomId = state.activeRoomId || 'default';
    const currentRoom = state.rooms[roomId] || getDefaultRoomState().rooms.default;
    
    const updatedRoom = {
      ...currentRoom,
      rp22: {
        perSeat: perSeat !== null ? perSeat : (currentRoom.rp22?.perSeat || {}),
        overall: overall !== null ? overall : (currentRoom.rp22?.overall || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    const newState = {
      ...state,
      rooms: {
        ...state.rooms,
        [roomId]: updatedRoom,
      },
    };

    saveToLocalStorage(newState);
    notifySubscribers(newState);
  }, [state]);

  // Set active room ID
  const setActiveRoomId = useCallback((roomId) => {
    if (!roomId || !state.rooms[roomId]) return;
    
    const newState = {
      ...state,
      activeRoomId: roomId,
    };

    saveToLocalStorage(newState);
    notifySubscribers(newState);
  }, [state]);

  return {
    roomState: state,
    activeRoom: getActiveRoom(),
    setRoomState,
    updateRoomState,
    updateRP22Results,
    setActiveRoomId,
  };
}

export default useRoomStateStore;