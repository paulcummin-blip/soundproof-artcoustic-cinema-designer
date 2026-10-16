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
 *     craft, the design-team judgement rule, the repetition rule, the natural
 *     language refinement (how many things the copy explains, how it must sound
 *     said aloud, and how confidently an established principle is explained) and
 *     the final natural-writing review;
 *   - the deterministic half, matched against a returned draft by
 *     writerNaturalWritingRules.js: the punctuation rule, the stock connectives,
 *     the mechanical openers and the generic claim phrases.
 *
 * Every string here is either read by the model or matched against client-facing
 * copy, so this file is written without an em dash.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/**
 * The standard's own generation, so a refinement is always traceable.
 *
 * v2 is the natural language refinement: the copy selects the three or four
 * aspects that matter most in this cinema rather than mentioning everything, it
 * is written the way a designer would say it aloud rather than in the abstract
 * register a report uses, an established engineering principle is explained
 * confidently without waiting for a high Performance Level, and the writer's own
 * review asks whether a professional designer would actually say it. No word
 * limit, section identity, claim ground or validation rule changed.
 *
 * v3 is the editorial-reference refinement: the standard no longer shows the
 * writer any example of awkward language, and it carries two or three short
 * approved passages instead, as editorial references that demonstrate the voice
 * at its best. Every principle the earlier generations stated is unchanged, the
 * deterministic readings are untouched, and no word limit, section identity,
 * claim ground or validation rule moved.
 */
export const NATURAL_WRITING_STANDARD_VERSION = 3;

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

/**
 * SELECT, DO NOT MENTION EVERYTHING. The natural language refinement, first half:
 * the copy is a brief explanation of a design, so it develops a few aspects
 * properly instead of touching every result the analysis produced.
 */
export const NATURAL_SELECTION_RULE = 'THREE OR FOUR THINGS, NOT EVERYTHING: find the three or four aspects that matter most in this particular cinema and develop those properly, in your own words. This copy is a brief overview of the design and what it is for, never an equipment list and never a tour of everything the analysis measured: the specifications are stated in the Project Summary and in the evidence pages beside this copy, so they are not restated here. Where the evidence offers more strengths than the copy can carry, choose the ones this room and this brief actually need and say nothing about the rest. A short piece that explains the right three things well reads better than a longer one that mentions everything briefly.';

/**
 * THE SAY-IT-ALOUD RULE. The natural language refinement, second half: the
 * register the copy is written in, with the abstract constructions it replaces.
 * The quoted rewrites are illustrations of the movement, never wording to reuse.
 */
export const NATURAL_ALOUD_RULE = 'SAY IT THE WAY YOU WOULD SAY IT: this copy is an experienced designer explaining the cinema to the client in the room, so anything that would not be said aloud is rewritten. Keep the actor and the action visible (who or what does something, and what the client notices because of it), use concrete subjects and active verbs, and never dress a plain point up as an abstract phrase or let a noun do the work a sentence should do. Avoid the restrained and unnecessarily technical register as well: write the design with the confidence of someone who believes in it, say why each important choice matters to the person watching the film, and explain plainly what the finished cinema gives them, the scale of the picture, movement around and above the audience, the weight of a soundtrack and the pleasure of watching films in this room.';

/**
 * THE APPROVED REFERENCE PASSAGES.
 *
 * Short passages of Sound Proof writing at its best, shown to the writer as
 * EDITORIAL REFERENCES. They demonstrate the natural British English, the
 * confidence, the sentence rhythm, the professional design reasoning and the
 * enjoyment of the cinema that the standard asks for, so the register is shown
 * rather than described.
 *
 * They are references and never templates. Their project-specific detail is
 * never carried into another design, and their wording and their structure are
 * never required.
 *
 * The standard states the principles; these passages show what the principles
 * produce. NO negative example is carried anywhere: the writer is never handed a
 * sentence in order to avoid it.
 */
export const NATURAL_WRITING_REFERENCE_PASSAGES = Object.freeze([
  'This dedicated cinema brings the scale and excitement of the big screen into a compact room, with a spectacular projection image providing the centrepiece.',
  'The loudspeaker arrangement creates a convincing sense of space and movement. Front-wide and surround speakers extend the action beyond the screen, while dedicated overhead loudspeakers bring another dimension to the experience.',
  'Positioning subwoofers at the front and rear helps manage the room\'s low-frequency behaviour, while providing the depth and impact that make demanding film soundtracks so enjoyable.',
]);

/**
 * The reference passages as the writer reads them, as ONE prompt block: the
 * standard shown at its best, with the two limits that keep them references
 * rather than templates.
 *
 * @returns {string} the block, carried as a single prompt entry
 */
export function naturalWritingReferenceBlock() {
  return [
    '=== EDITORIAL REFERENCES (the standard, written at its best) ===',
    'These passages show how Sound Proof writing reads when the standard above is met: confident, natural British English, professional design reasoning, and a clear enjoyment of the cinema being described. Read them for their voice, their rhythm and the way each one reasons about the design.',
    'They are references and never templates. Never carry their project-specific detail into another design, and never copy their wording or their structure: what they demonstrate is how this project\'s own copy should read, not what it should say.',
    ...NATURAL_WRITING_REFERENCE_PASSAGES.map((passage) => `- ${passage}`),
    '',
  ].join('\n');
}

/**
 * EXPLAIN THE PRINCIPLE, DO NOT WAIT FOR THE RESULT. An established engineering
 * principle carries no figure, no Performance Level and no promise about this
 * project, so it is explained confidently on its own terms. The three principles
 * below are illustrations of that register, never facts to attach to a design.
 */
export const NATURAL_PRINCIPLE_EXPLANATION_RULE = 'EXPLAIN AN ESTABLISHED PRINCIPLE CONFIDENTLY: where a design decision rests on an established cinema engineering principle, explain what it does for the client with confidence, and never wait for a high Performance Level before a principle may be explained. Six overhead loudspeakers across two rows can carry sound above the audience more continuously than four. Distributing the subwoofer positions around the room helps manage the room\'s own resonances and improves the opportunity for consistent bass across the seating. Suitable clearance around the seating helps reduce the acoustic compromise that comes with sitting hard against a boundary. Each of those is a design principle, true of the approach whether this project scored well or not, so it is stated plainly, positively and in the client\'s own terms rather than hedged. Never turn a principle into a promise: a principle is not a result this design achieved, so never write that the design delivers the benefit, never invent an improvement, and never guarantee performance the frozen evidence does not state. Where the evidence does state a result for this design, the principle explains it and the result is stated once, at its own scope.';

/** The review the writer applies to the whole document before returning it. */
export const NATURAL_WRITING_REVIEW = Object.freeze([
  'THE NATURAL WRITING REVIEW: before returning the proposal, read every section together as one document and answer this for yourself. Does this sound like a real cinema designer? Is the wording natural? Does it explain this actual project? Does every sentence add useful information? Is anything repetitive? Are there generic marketing phrases? Are the qualifications excessive? Does the writing flow naturally? Is the design intent clear? Could the dealer confidently read this aloud to the client?',
  'Refine the wording where the answer is no. Introduce no new engineering fact, product specification or performance claim while doing it, preserve every claim ground and every section identity, and never print the review, a note about a change or any explanation of your own editing in the proposal.',
  'THE NATURAL LANGUAGE REVIEW, read with the designer\'s own ear: would a professional cinema designer actually say this to a client? Does it sound natural when it is read aloud? Does it explain why the design matters? Does it communicate the pleasure and excitement of watching films in this room? Are any phrases awkward, repetitive or unnecessarily technical? Rewrite every sentence that fails one of those, silently, and return only the polished copy: no note about the change, no explanation of your editing and no second version.',
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