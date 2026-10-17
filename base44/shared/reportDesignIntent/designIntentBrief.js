/**
 * designIntentBrief.js (shared, PROJECT REPORT ONLY)
 * --------------------------------------------------
 * THE Project Report's Design Intent, as the Astra writer is briefed to write it.
 *
 * The Design Intent is the paragraph block that opens the report above the facts
 * sheet: the design intent, why it suits this particular room, and what the
 * picture, the seating and the loudspeaker arrangement give the client. It is the
 * report's own `decision_summary` section — the contract already carries that
 * section, its requirement and its word limit — so this module does not declare a
 * second section or a second contract. It states the Design Intent's own brief
 * INTO that section, exactly as the Design Summary is briefed for a TV media room,
 * and it changes nothing else.
 *
 * The voice, the natural-writing standard and the shared Sound Proof writing
 * authority are not restated here: they travel with the writer's contract, which
 * the prompt carries. This file holds only what is specific to the Design Intent:
 * the three things it explains, the project's own facts it is written from, the
 * plain register it is written in, the editorial references that show that
 * register at its best, the words and phrases it never uses, and the length it
 * may run to on the report's first page.
 *
 * The length is a real constraint rather than a style note: the block occupies a
 * fixed place in the report's page budget, so the ceiling is set to the width of
 * the page's own copy column and a draft that runs longer is refused by the
 * validator exactly as any other over-long section is.
 *
 * Wording only. Nothing here reads, changes or reorders a figure, a level, a
 * product, a claim or a validation rule, and no engineering, report-composition
 * or pagination authority is touched.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The one section the Design Intent is written as. */
export const DESIGN_INTENT_SECTION = 'decision_summary';

/** The written target the writer is given. */
export const DESIGN_INTENT_TARGET_WORDS = '130 to 175';

/** The ceiling the draft is validated against: headroom above the target. */
export const DESIGN_INTENT_WORD_LIMIT = 200;

/**
 * THE DESIGN INTENT'S APPROVED REFERENCE PASSAGES.
 *
 * Three short paragraphs of Sound Proof design intent at its best, shown to the
 * writer as EDITORIAL REFERENCES: the voice, the practical design reasoning, the
 * sentence rhythm and the shape this block is written to, so the register is
 * shown rather than described.
 *
 * They are references and never templates, and they carry no figure, product,
 * layout, distance or room of their own: there is nothing in them that could be
 * carried into another design. Every fact in this project's copy comes from that
 * project's own frozen evidence.
 */
export const DESIGN_INTENT_REFERENCE_PASSAGES = Object.freeze([
  'The seating is deliberately kept clear of the rear wall, leaving useful space for the surround system behind the listeners. This also avoids placing the rear row against a boundary that can make low-frequency performance more difficult to control.',
  'The front wides, side and rear surrounds, and overhead channels provide strong spatial resolution around and above the seating. The screen channels maintain close level consistency across the primary seats, while the screen, surround and overhead groups each maintain close tonal consistency within their respective layers.',
  'Dynamic capability is strong, with substantial headroom from the screen channels and useful reserve from the surround and overhead speakers. The subwoofer arrangement extends the predicted low-frequency response, giving the system the depth and impact expected from a dedicated cinema.',
]);

/**
 * The reference passages as the writer reads them, as ONE block: this block
 * written well, with the limit that keeps them references rather than templates.
 *
 * @returns {string} the block, carried inside the section requirement
 */
export function designIntentReferenceBlock() {
  return [
    '=== DESIGN INTENT REFERENCE (the register to write to) ===',
    'These three paragraphs show this block written well: what the room is designed around, why the layout is right for it, and what the system does well, in short active sentences with this project\'s own facts doing the work and no more than one strong adjective in a paragraph.',
    'They are references and never templates. Every fact in them belongs to the design they describe, so take every figure, layout, product, distance and room fact in your copy from this project\'s own frozen evidence and never carry one of theirs across.',
    ...DESIGN_INTENT_REFERENCE_PASSAGES.map((passage) => `- ${passage}`),
    '',
  ].join('\n');
}

/**
 * The Design Intent's own instruction. It states the three things the block
 * explains, the project facts it is written from, the three performance ideas it
 * develops as prose, the plain register it is written in, what it never recites
 * and what it never invents, and the shape and length it may run to on the
 * report's first page. It is written as the shape of the copy rather than as a
 * sentence to paste: the room, the display, the seating and the system all come
 * from this project's own frozen evidence.
 */
export const DESIGN_INTENT_REQUIREMENT = [
  'This block is the report\'s Design Intent: it opens the Project Report above its facts sheet, and it is written for the client as the design team\'s own account of the design.',
  'Explain three things and nothing else: what this room is designed around, why the layout was chosen for it, and what the system does well. Write it as an experienced home cinema designer talking the client through the design, and never announce a recommendation: never open on a formulaic phrase such as "Our recommendation is" or "We recommend".',
  'OPEN ON THE DESIGN REASONING, NEVER ON THE SPECIFICATION SCHEDULE. Paragraph one answers one question: why is the room laid out this way? Work from where the seating sits and how it relates to the screen, the space the arrangement keeps behind the listeners, the constraints the room itself puts on the design, and the decisions that follow from them. State the decision and then why it is right for this room.',
  'DRIVE THE COPY WITH THIS PROJECT\'S OWN FACTS, taken from the frozen evidence and cited to the claim each one rests on. The Project Summary and the evidence pages state the specification in full, so this block states the few facts it actually explains rather than reciting them, and those facts are the display and its format, the loudspeaker layout, how the seating is arranged in the room, the loudspeaker layers this design actually has, the subwoofer arrangement, and how low the bass system reaches. Name a product model only where the frozen evidence states it for this design.',
  'NEVER REPEAT THE SUMMARY ABOVE THIS BLOCK. The Project Summary immediately above this copy already states the room dimensions, the display and its format, the seating count, the system format, the screen channels, the surrounds, the overheads and the subwoofers, and the evidence pages beside it state the results in full. Mention one of those facts only where it helps explain why the design works, and leave every other one to the summary: the seating kept clear of the rear wall earns its place because it explains the space behind the audience and one of the more difficult room boundaries for bass performance, where reciting the display size, the seat count and the channel list earns nothing.',
  'Then never recite the specification: no equipment-by-equipment schedule, no repeated room dimensions, no Performance Level, no parameter name or code, no channel-by-channel account, and no output figure the client can already read on the evidence pages beside this block.',
  'Develop the three core performance ideas as prose, never as headings, never as a list and never one paragraph per idea. SPATIAL RESOLUTION is how the loudspeaker arrangement carries sound around and above the seating, and how consistent the front soundstage is across the primary seats. TIMBRE MATCHING is how the loudspeaker layers hold their own tonal balance, stated for the layer and the seats those results cover. DYNAMIC RANGE is how much headroom the front stage, the surround and overhead layers and the bass system have for demanding film soundtracks.',
  'Make SPATIAL RESOLUTION specific and evidence-led: name the loudspeaker layers and channels THIS design actually has — the front wides, the surrounds, the rear surrounds, the overhead channels — and say what they cover around and above the seating, how the screen channels hold the front soundstage across the primary seats, and what the primary-seat results show. State the resolution, then explain what produces it. TIMBRE MATCHING is written in plain, credible language: the screen, surround and overhead groups each maintain close tonal consistency within their respective layers, and a stronger form such as excellent tonal consistency is used only where the authoritative evidence supports it. DYNAMIC RANGE is the whole system\'s capability, explained from the authoritative evidence behind it — the headroom the screen channels have at the reference position, useful reserve from the surround and overhead speakers, and what the bass system adds — and never as a vague impression of scale or power.',
  'State a measured result only where the frozen evidence states it and only at the scope that result covers. An intention is never written as an achieved result, and a measured or calculated result is never written as an intention.',
  'Write plainly and concretely: short direct sentences, active voice, practical design reasoning, and specifics this project\'s own evidence states. Describe what the loudspeakers do and where the client sits and listens, never what the sound is like as a feeling: no figurative or anthropomorphic language about sound, no metaphor, no cinematic cliche, no vague claim about immersion and no marketing language. Explain each point once, add no filler, and never explain the same idea twice in different words.',
  'NEVER USE THESE WORDS AND PHRASES: remarkably; exceptional experience; serious cinema-scale; drawn into the action; becomes part of the scene; preserve their own tonal character; stable connection between sound and picture; substantial scale alongside quiet dialogue. Write with these instead: consistent; close; strong; substantial headroom; useful reserve; clear coverage; predicted response; tonal consistency.',
  'DO NOT STACK STRONG ADJECTIVES AND NEVER REPEAT ONE. Excellent, exceptional, considerable, powerful and substantial are used only where this project\'s own evidence genuinely justifies them, and no paragraph carries more than one of them. Prefer close, strong, useful and consistent, and keep substantial headroom for headroom the evidence actually shows. PREFER THE EVIDENCE TO THE BENEFIT IT DESCRIBES: where the frozen evidence publishes a measured or modelled result, state that result instead of a general claim about the sound — the layout extends the predicted low-frequency response to the published figure, never the system provides powerful bass output.',
  'KEEP EACH PERFORMANCE POINT PRACTICAL AND GROUNDED. Timbre matching states that the screen, surround and overhead groups each maintain close tonal consistency within their respective layers and stops there. Dynamic range states substantial headroom from the screen channels and useful reserve from the surround and overhead speakers, never considerable reserve around and overhead. The bass states the published extension and then what it gives the client — giving the system the depth and impact expected from a dedicated cinema — never supports the low notes and atmosphere of a film soundtrack, and never a sensation the evidence does not state.',
  'BASS IS THE PUBLISHED RESULT, NOT A FEELING. Where the frozen evidence publishes how low this design reaches, state it as the predicted response it is — the layout extends the predicted low-frequency response to the published figure — and then say in one short sentence what that gives the client in a film soundtrack. Never invent room gain, never describe bass as a sensation, and never put a subjective claim about weight or power in place of the extension the evidence publishes.',
  'Translate the established engineering principles this design rests on into client benefits, confidently and in plain language. A principle may be explained confidently without a high Performance Level behind it.',
  'Where recorded designer intent is supplied, understand the engineering principle it explains and state it professionally in your own words. It is semantic input, never finished prose: never paraphrase the designer, and never reproduce a note, a brief, an instruction or a filename.',
  'Acoustic treatment is supporting evidence, never a selling point: never name a treatment product and never state a treatment quantity.',
  'Never invent a physical loudspeaker position, a designer decision or an achieved performance the frozen evidence does not record.',
  'Be positive, fluent and confident, in natural British English.',
  `Length: ${DESIGN_INTENT_TARGET_WORDS} words in three short paragraphs, and never more than the word limit. This block sits inside the report's fixed first-page budget, so it states what the design is and what it gives the client and then stops: paragraph one is the design reasoning, why the room is laid out the way it is; paragraph two develops spatial resolution and timbre matching; paragraph three develops dynamic range and the bass capability. Every fact the summary above this block already states stays out of it.`,
  designIntentReferenceBlock(),
].join(' ');

/** The scope rule the writer reads beside the section it is being given. */
export const DESIGN_INTENT_SCOPE_RULE =
  'This is a section-scoped writing job, not a proposal: you are given ONE section, the Design Intent of the Project Report, and it is the only section you return. Return that section alone, under its own ID, with its own claim citations, and write nothing anywhere else.';

/**
 * The Design Intent's own entry for a given section set: the same section ID,
 * title and grounding rule the contract states, with this block's requirement and
 * ceiling in place of the contract's. Every other entry is returned untouched, so
 * nothing outside the Design Intent is briefed differently.
 *
 * @param {Array<Object>} sections — writer section requirements
 * @returns {Array<Object>}
 */
export function applyDesignIntentBrief(sections) {
  const listed = Array.isArray(sections) ? sections : [];
  return listed.map((entry) => (entry?.section === DESIGN_INTENT_SECTION
    ? { ...entry, requirement: DESIGN_INTENT_REQUIREMENT, word_limit: DESIGN_INTENT_WORD_LIMIT }
    : entry));
}

/** The one section entry a scoped Design Intent input carries. */
export function designIntentSection(sectionRequirements) {
  const listed = Array.isArray(sectionRequirements) ? sectionRequirements : [];
  const entry = listed.find((row) => row?.section === DESIGN_INTENT_SECTION) || null;
  if (!entry) {
    throw new Error('The writer contract carries no Design Intent section, so the report intent cannot be written.');
  }
  return { ...entry, requirement: DESIGN_INTENT_REQUIREMENT, word_limit: DESIGN_INTENT_WORD_LIMIT };
}

export default applyDesignIntentBrief;