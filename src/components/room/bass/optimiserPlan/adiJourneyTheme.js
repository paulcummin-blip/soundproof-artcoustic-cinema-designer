// adiJourneyTheme.js
// ---------------------------------------------------------------------------
// The Bass Optimisation card's THEME — presentation only.
//
// Extracted from AdiOptimisationJourney.jsx so the journey stays the
// orchestration layer. The theme states how a state looks (tone, icon, border
// and fill) and nothing about what it means: every label and every sentence is
// resolved by the authorities (resolveAdiOptimiserJourney,
// resolveOptimiserPresentationState, resolveRetestPresentation).
//
// The canonical presentation state and the journey state share ONE theme: the
// theme is keyed by journey state, and a presentation state maps onto the
// journey tone that expresses it. A trade-off is a decision waiting on the
// designer, so it takes the same attention tone a re-evaluation uses — never
// the "improvement" tone.
//
// PURE: no React, no store, no calculation.
// ---------------------------------------------------------------------------

import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ADI_OPTIMISER_JOURNEY_STATE } from "./resolveAdiOptimiserJourney.js";
import { OPTIMISER_PRESENTATION_STATE } from "./resolveOptimiserPresentationState.js";

export const STATE_THEME = {
  [ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED]: {
    pill: { background: "#625143", color: "#FFFFFF" },
    border: "#E0DCD5",
    background: "#F4F1EC",
    icon: Activity,
    iconColor: "#625143",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED]: {
    pill: { background: "#B45309", color: "#FFFFFF" },
    border: "#E8D5AE",
    background: "#FDF6E9",
    icon: AlertTriangle,
    iconColor: "#B45309",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE]: {
    pill: { background: "#625143", color: "#FFFFFF" },
    border: "#E0DCD5",
    background: "#F4F1EC",
    icon: Activity,
    iconColor: "#625143",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE]: {
    pill: { background: "#213428", color: "#FFFFFF" },
    border: "#CFDCCF",
    background: "#F4F7F4",
    icon: Activity,
    iconColor: "#213428",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT]: {
    pill: { background: "#625143", color: "#FFFFFF" },
    border: "#E0DCD5",
    background: "#F4F1EC",
    icon: CheckCircle2,
    iconColor: "#625143",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.FAILED]: {
    pill: { background: "#B91C1C", color: "#FFFFFF" },
    border: "#F0C9C9",
    background: "#FDF2F2",
    icon: AlertTriangle,
    iconColor: "#B91C1C",
  },
};

export const PRESENTATION_THEME_KEY = Object.freeze({
  [OPTIMISER_PRESENTATION_STATE.NO_RUN]: ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED,
  [OPTIMISER_PRESENTATION_STATE.RUNNING]: ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED,
  [OPTIMISER_PRESENTATION_STATE.STALE]: ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED,
  [OPTIMISER_PRESENTATION_STATE.TRADE_OFF]: ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED,
  [OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE]: ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE,
  [OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE]: ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE,
  [OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT]: ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT,
  [OPTIMISER_PRESENTATION_STATE.FAILED]: ADI_OPTIMISER_JOURNEY_STATE.FAILED,
});

/** The tone a state with no theme of its own falls back to. */
export const ADI_JOURNEY_FALLBACK_STATE = ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED;

/** The theme the card is drawn in, resolved from the state it is stating. */
export function resolveAdiJourneyTheme({ journeyState = null, fallbackState = null } = {}) {
  return STATE_THEME[journeyState]
    || STATE_THEME[fallbackState]
    || STATE_THEME[ADI_JOURNEY_FALLBACK_STATE];
}

/** The journey tone a canonical presentation state is drawn in. */
export function presentationThemeState(presentationState) {
  return PRESENTATION_THEME_KEY[presentationState] || null;
}