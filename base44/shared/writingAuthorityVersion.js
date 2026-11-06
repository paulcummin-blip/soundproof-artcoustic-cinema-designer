/**
 * writingAuthorityVersion.js (shared)
 * -------------------------------------
 * The single editorial-currency identifier for Sound Proof's client-facing
 * writing rules.
 *
 * Engineering fingerprints and the prompt version are separate: an accepted ADI
 * narrative may still match its engineering evidence while being editorially
 * out of date. This version captures the generation of the WRITING RULES — the
 * shared Sound Proof writing authority, the Design Intent brief and the natural-
 * writing standard — independent of the prompt version and the engineering
 * contract.
 *
 * Bump this integer when the writing rules change in a way that should refresh
 * already-accepted ADI narratives. The saved narrative record carries the
 * version it was written under, and the client-side refresh check reads the
 * difference: an accepted narrative whose engineering still matches but whose
 * writing-authority version differs is refreshed once, with the old text
 * preserved until the replacement succeeds.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Safe to import from any
 * backend function or any client module.
 */
export const WRITING_AUTHORITY_VERSION = 1;