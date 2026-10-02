/**
 * proposalStageBoundary.js (shared)
 * ---------------------------------
 * The proposal-stage rule for the client-facing System Design reports
 * (System Design Summary and System Design Comparison).
 *
 * A report is written AFTER the design is complete. It explains the design that
 * was selected: why it works, what the client gains, the intended experience,
 * the strong performance, the compromises where they matter, and the selected
 * upgrade paths that were already part of the design options or the designer
 * brief.
 *
 * It is never a second design consultation. Design-stage suggestions,
 * optimisation ideas and "what could improve this?" belong in the design stage
 * (the Room Designer and ADI design guidance), never in a final report.
 *
 * The boundary covers every design change, not only bass: placement, subwoofer
 * count, layout, processor and calibration. Upgrade suggestions are allowed
 * only where they are already supported by the data, another saved version, a
 * compared option or the designer brief, and are always phrased as a future
 * option rather than a correction.
 *
 * Pure text. No React, no side effects, no runtime-specific APIs.
 */

/** The upgrade-path rule, stated once for every section that mentions an upgrade. */
export const UPGRADE_PATH_RULE = 'Upgrade suggestions are allowed only when they are obvious and safe, supported by the data, already represented by another saved version or a compared option, or included in the designer brief, and they are always phrased as a future option rather than a correction. Never write a correction to the selected design: never suggest moving the subwoofers, adding subwoofers, changing the layout, adding or changing a processor, changing the calibration platform, or improving a design that is already complete.';

/** The proposal-stage rule as one line, for the per-section instructions. */
export const PROPOSAL_STAGE_RULE = 'This is a client-facing explanation of the design that was selected, not a second design consultation. Explain why the design works, what the client gains and the intended experience. Do not raise a design change, a placement change, a product change, a processor change or a calibration change, and do not open a new design question.';

/**
 * The full proposal-stage boundary block, injected into every System Design
 * report prompt by the writing style contract. Contains no em dashes.
 */
export const PROPOSAL_STAGE_BOUNDARY = [
  '=== PROPOSAL STAGE: EXPLAIN THE DESIGN, NEVER REDESIGN IT ===',
  'Explain the design that was selected: why it works, what the client gains, the intended experience, the strong performance, the compromises where they matter, and the selected upgrade paths that were already part of the design options or the designer brief.',
  'Never act as a second design consultant after the design is complete. Never write that the subwoofers should move, that more subwoofers should be added, that the layout should change, that a different or better processor should be added, that a different calibration platform should be used, or that the design should be improved further after the fact. Never undermine the selected design with an idea raised at this stage, and never create a recommendation that is not already in the project data, a saved version or the designer brief.',
  UPGRADE_PATH_RULE,
  'Suggestions, optimisation ideas and questions about what could improve the design belong in the design stage, where the design was developed and the options were compared. They do not belong in this report.',
  'WRITE THIS (a future option, supported by the data):',
  '- "If greater overhead movement becomes a priority later, the natural upgrade would be a middle overhead pair, provided the processor and ceiling layout allow it."',
  '- "The four-subwoofer option improves bass consistency across more seats. The benefit is control and evenness, not simply extra bass."',
  '- "This 5.1 design gives a clean and credible surround experience. A future height layer would add Atmos movement, but it is not required for the current brief."',
  'NEVER WRITE THIS (a correction to a finished design):',
  '- "Move the subwoofers to improve bass consistency."',
  '- "The designer should add more subs."',
  '- "ADI recommends changing the layout."',
  '- "The current design is limited and should be improved further."',
  '- "Add a better processor."',
  '- "Use a different calibration platform."',
].join('\n');