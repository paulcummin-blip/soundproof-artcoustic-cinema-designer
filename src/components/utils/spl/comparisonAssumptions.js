// comparisonAssumptions.js
// ---------------------------------------------------------------------------
// Controlled comparison assumptions and parity statements for the RP22
// Speaker Capability comparison. Pure constants — no imports — so they are
// importable by tests and by every surface that states the assumptions
// (the candidate builder, the comparison data-status panel, the readiness
// list) without pulling in the base44 SDK.
// ---------------------------------------------------------------------------

export const ADI_ESTIMATE_STATEMENT =
  "This is an ADI estimate based on available manufacturer data. It is useful for early comparison but not equivalent to verified published capability data.";

// The 100 Hz crossover convention is a Sound Proof comparison assumption, not
// a manufacturer specification. P12/P13 compares the MAIN speaker's capability
// operating above the assumed 100 Hz crossover — the subwoofer handles the
// low-frequency content below it. So the broadband maximum SPL (not a
// frequency-specific LF figure) is the capability limit. The same convention
// is applied to both Artcoustic and competitor speakers so the comparison is
// like-for-like.
export const CROSSOVER_ASSUMPTION =
  "Sound Proof assumes a 100 Hz crossover for main-speaker P12/P13 comparison — the published broadband maximum SPL is the capability limit, not a frequency-specific low-frequency figure.";

export const COMPARISON_PARITY_STATEMENT =
  "Same RP22 P12/P13 engine, distance, amplifier power, 1 W / 1 m normalisation and 100 Hz crossover convention as the Artcoustic row.";