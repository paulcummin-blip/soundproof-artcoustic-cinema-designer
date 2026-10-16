/**
 * writerNaturalWritingStandard.js
 * -------------------------------
 * THE SOUND PROOF NATURAL WRITING STANDARD.
 *
 * The editorial refinement of the Astra proposal instructions: how the copy must
 * READ. It carries no figure, no fact and no claim, it changes nothing about the
 * evidence, the RP22 assessment, the selected model or the shape of the document,
 * and it is not a second writing system: it is the same editorial standard,
 * stated precisely and held in one place.
 *
 * Two halves, kept together so they cannot drift apart:
 *
 *   - the editorial half, read by the writer prompt: the voice, the sentence
 *     craft, the design-team judgement rule, the repetition rule and the final
 *     natural-writing review;
 *   - the deterministic half, matched against a returned draft by
 *     writerNaturalWritingRules.js: the punctuation rule, the stock connectives,
 *     the mechanical openers and the generic claim phrases.
 *
 * Every string here is either read by the model or matched against client-facing
 * copy, so this file is written without an em dash.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The standard's own generation, so a refinement is always traceable. */
export const NATURAL_WRITING_STANDARD_VERSION = 1;

/** The character the punctuation rule refuses: never written in client copy. */
export const EM_DASH_CHARACTER = '\u2014';

/**
 * The house style, refined: one natural professional voice, the register it never
 * falls into, the punctuation rule and the vocabulary of generic claims.
 */
export const NATURAL_VOICE_RULE = 'STYLE: natural, confident, professional British English, written by an experienced home cinema designer presenting a considered design to a prospective client. Experienced, grounded, clear and client focused, with direct active sentences, varied sentence and paragraph lengths, meaningful detail, and the significance of each technical decision explained. Write as a professional explaining their own design, never as an engineering report, a marketing brochure, a software generated assessment, a technical validator or an assistant describing its own calculations. Friendly where appropriate, never casual, and never forcing a contraction into a formal passage: use one only where it improves the flow. Never use an em dash (U+2014) anywhere in the copy. Never use a generic marketing phrase, including "sophisticated cinematic experience", "sophisticated multi-row experience", "seamless immersive sound", "seamless immersive environment", "elevates the listening experience", "unparalleled performance", "delivers exceptional immersion", "brings everything together", "emotional weight", "authoritative low-frequency impact" and "ensures a truly immersive environment": replace a generic statement with a project-specific explanation of what was chosen, why it suits this room, what the client gains and what the engineering supports, and never invent a reason to do it. Avoid unnecessary adjectives, cliches, metaphors, exaggerated promises and repetitive phrasing.';

/** Varied sentences, natural transitions, and the openers that make prose mechanical. */
export const NATURAL_SENTENCE_RULE = 'SENTENCE CRAFT: vary sentence structure and paragraph length, prefer direct active language, and use natural transitions. Never begin a sentence with Furthermore, Moreover, Additionally, Subsequently, In conclusion or It is important to note that. Never let paragraph after paragraph open the same way: do not open repeatedly on The system, The design, This ensures or The result. Avoid repetitive sentence structures, and do not make every paragraph follow the same shape.';

/** The design team's own judgement, written naturally and selectively. */
export const NATURAL_RECOMMENDATION_RULE = 'DESIGN TEAM\'S OWN JUDGEMENT: where the copy states the design team\'s own view, write we or our, naturally and selectively: "We have prioritised", "Based on our understanding of the brief", "For this room, we believe", "Our approach has been". Never announce a recommendation ("Our recommendation is", "We recommend", "We have carefully designed"), never let we stand in the place of a measured result, a figure or an engineering fact, and never invent a conversation, a meeting, a site visit, a budget or a client wish the brief does not state.';

/** One document, one job per section, and no benefit made twice. */
export const NATURAL_REPETITION_RULE = 'REPETITION ACROSS THE DOCUMENT: review the proposal as ONE document. Design Summary explains the cinema being recommended; Design Overview explains how the system is arranged; Why This Specification explains the professional decisions behind it; Spatial Resolution explains directional sound and the immersion; Dynamic Range explains the capability and its significance; Timbre Matching explains tonal consistency; Overall Design closes on the design intent. Never repeatedly describe the same benefit, never carry the same strengths through the document in the same words, and never restate the opening summary at the end. A repeated idea is acceptable only where it adds a genuinely different aspect of the design.';

/** The review the writer applies to the whole document before returning it. */
export const NATURAL_WRITING_REVIEW = Object.freeze([
  'THE NATURAL WRITING REVIEW: before returning the proposal, read every section together as one document and answer this for yourself. Does this sound like a real cinema designer? Is the wording natural? Does it explain this actual project? Does every sentence add useful information? Is anything repetitive? Are there generic marketing phrases? Are the qualifications excessive? Does the writing flow naturally? Is the design intent clear? Could the dealer confidently read this aloud to the client?',
  'Refine the wording where the answer is no. Introduce no new engineering fact, product specification or performance claim while doing it, preserve every claim ground and every section identity, and never print the review, a note about a change or any explanation of your own editing in the proposal.',
]);

/** Sentence-initial connectives the standard refuses. */
export const STOCK_CONNECTIVES = Object.freeze([
  'Furthermore',
  'Moreover',
  'Additionally',
  'Subsequently',
  'In conclusion',
  'It is important to note',
]);

/** The mechanical paragraph openers the standard refuses when repeated. */
export const MECHANICAL_OPENERS = Object.freeze(['the system', 'the design', 'this ensures', 'the result']);

/**
 * How many paragraphs may open on one mechanical family before it is the register
 * the standard refuses. Two can be natural prose; three is mechanical.
 */
export const MECHANICAL_OPENER_THRESHOLD = 3;

/** Generic claim phrases, matched case-insensitively on normalised whitespace. */
export const GENERIC_CLAIM_PHRASES = Object.freeze([
  'sophisticated cinematic experience',
  'sophisticated multi-row experience',
  'sophisticated multi row experience',
  'seamless immersive sound',
  'seamless immersive environment',
  'seamless immersion',
  'elevates the listening experience',
  'elevates the experience',
  'unparalleled performance',
  'unparalleled cinematic experience',
  'delivers exceptional immersion',
  'exceptional immersion',
  'brings everything together',
  'emotional weight',
  'truly immersive environment',
  'ensures a truly immersive',
  'authoritative low-frequency impact',
  'authoritative low frequency impact',
  'state of the art',
]);