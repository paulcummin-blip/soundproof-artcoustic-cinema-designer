// graphInteractionStore — bidirectional interaction state between the
// RP22 header pills and the bass response graph.
//
// When a designer clicks a P19 or P20 pill, the store records which RP22
// parameter is selected. The graph subscribes and renders a prominent
// highlight at the corresponding limiting frequency.
//
// When a designer clicks a seat on the graph, the store records the seat
// selection so the pills can reflect which seat's result is shown.
//
// This is presentation-only state. It never changes calculations, RP22
// grading, or optimiser results. It only controls which frequency the
// graph emphasises.

const listeners = new Set();

let state = {
  // Which RP22 parameter pill is currently selected.
  // 'p14' | 'p18' | 'p19' | 'p20' | null
  selectedMetric: null,

  // The frequency (Hz) the graph should prominently highlight.
  // Derived from rp22GraphMarkers by the consumer (BassResponse).
  // Set directly when the graph itself initiates the highlight.
  highlightFrequencyHz: null,

  // Human-readable label for the highlight (e.g. "P19 worst · 47 Hz").
  highlightLabel: null,

  // Which seat is currently focused (drives graph seat selection).
  // 'rsp' | '<seatId>' | null
  selectedSeatId: null,
};

export function getGraphInteractionState() {
  return state;
}

export function setGraphInteraction(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export function subscribeGraphInteraction(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearGraphInteraction() {
  setGraphInteraction({
    selectedMetric: null,
    highlightFrequencyHz: null,
    highlightLabel: null,
    selectedSeatId: null,
  });
}

// React hook for subscribing to the interaction store.
import { useSyncExternalStore } from "react";

export function useGraphInteraction() {
  return useSyncExternalStore(
    subscribeGraphInteraction,
    getGraphInteractionState,
    getGraphInteractionState,
  );
}