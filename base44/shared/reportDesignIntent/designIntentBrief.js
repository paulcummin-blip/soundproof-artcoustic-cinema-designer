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
 * plain register it is written in, the APPROVED SENTENCE FRAMES this block is
 * written in and populated from this project's own evidence, the words and phrases
 * it never uses, and the length it may run to on the report's first page.
 *
 * The frames are the approved register rather than a starting point for the
 * writer's own phrasing: the copy prefers each frame unchanged and adapts it only
 * where one of this project's facts makes the wording wrong. Variation is not a
 * quality goal; accuracy, clarity and professional tone are.
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
 * THE DESIGN INTENT'S APPROVED SENTENCE FRAMES.
 *
 * Three approved frames, one per paragraph, in the register Sound Proof publishes
 * this block in and in the order it publishes it in: the cinema experience, spatial
 * resolution with timbre matching, and dynamic capability with the bass and the
 * design decisions. They show the writer exactly what to write
 * rather than describing a register to write towards, because this block is a
 * controlled engineering summary: the approved wording is the deliverable, and free
 * paraphrasing of it is a defect rather than a variation.
 *
 * Each frame is the approved sentence, and each states which parts of it are
 * populated from this project's own frozen evidence. None of them carries a figure,
 * a product, a room, a distance or a project of its own, so no fact can be carried
 * into another design from them: the brackets are the only variable, and every one
 * of them is filled from THIS project's evidence.
 */
export const DESIGN_INTENT_SENTENCE_FRAMES = Object.freeze([
  {
    id: 'cinema_experience',
    label: 'PARAGRAPH ONE: THE CINEMA EXPERIENCE',
    frame: 'This [the room type this design is] is designed around [this project\'s own display and its format], with [this project\'s own seat count and row arrangement] arranged to make the most of it. The screen and the seating have been considered together, so the seating sits within the picture at a scale that gives the room its cinematic character.',
    populate: 'the room type this design is, this project\'s own display and its format, and this project\'s own seat count and row arrangement',
  },
  {
    id: 'spatial_and_timbre',
    label: 'PARAGRAPH TWO: SPATIAL RESOLUTION AND TIMBRE MATCHING',
    frame: 'The loudspeaker layout extends that experience around and above the audience. The [loudspeaker layers this design actually has] provide strong spatial resolution around and above the seating. The screen channels maintain close level consistency across the [seat scope the evidence states that result for], while the [authoritative tonal groups the evidence supports] each maintain close tonal consistency within their respective layers.',
    populate: 'the layers this design actually has, the seat scope the evidence states the level-consistency result for, and the tonal groups the evidence actually supports',
  },
  {
    id: 'dynamic_and_bass',
    label: 'PARAGRAPH THREE: DYNAMIC RANGE, BASS AND THE DESIGN DECISIONS',
    frame: 'Dynamic capability is strong, with substantial headroom from the screen channels at the reference position and useful reserve from the surround and overhead speakers. The [this design\'s own subwoofer arrangement] extends the predicted low-frequency response to [this project\'s own authoritative extension figure], giving film soundtracks the depth and impact expected from a dedicated cinema.',
    populate: 'this design\'s own subwoofer arrangement, this project\'s own extension figure, the room-type vocabulary that fits this room, and any design decision this project\'s own evidence records for it',
  },
]);

/**
 * THE ONE OPTIONAL SENTENCE OF PARAGRAPH THREE.
 *
 * A detailed design decision is stated only where this project's own evidence
 * records it AND it is genuinely part of why this room is laid out as it is. The
 * seating kept clear of the rear wall is the common case, not a required sentence:
 * a project that records no such clearance writes no such sentence and forces
 * nothing in its place, and the block stays three paragraphs either way.
 *
 * It is deliberately NOT a fourth frame: the paragraph count and the three-paragraph
 * shape are unchanged, and this sentence is appended inside paragraph three.
 */
export const DESIGN_INTENT_DECISION_SENTENCE = Object.freeze({
  id: 'design_decision',
  label: 'PARAGRAPH THREE, ONLY WHERE THIS PROJECT RECORDS IT: THE DETAILED DESIGN DECISION',
  frame: 'The seating is set forward of the rear wall to leave useful space behind the audience for the surround system. Keeping listeners away from that boundary also avoids a position where bass can be more difficult to control, making the clearance a deliberate part of the room layout.',
  include_when: 'this project\'s own geometry records the clearance behind the seating and that decision is genuinely part of why the room is laid out as it is — never add it because the frame exists, and never write it where the evidence records no clearance',
  populate: 'the boundary this design actually clears, the surround layers this design actually has, and the room type this design is',
});

/**
 * The approved frames as the writer reads them, as ONE block: the three frames it
 * writes this block with, and what each bracket is populated from.
 *
 * @returns {string} the block, carried inside the section requirement
 */
export function designIntentSentenceFrameBlock() {
  return [
    '=== DESIGN INTENT SENTENCE FRAMES (the approved register to write in) ===',
    'These three frames are the APPROVED WORDING for this block, one frame per paragraph, in the register Sound Proof publishes it in. Write each frame as it stands and populate every bracket from this project\'s own frozen evidence. Prefer the frame unchanged: adapt it only where one of this project\'s facts makes the wording wrong, and where you adapt it, say the same thing in the same register. Variation is not a quality goal: accuracy, clarity and professional tone are.',
    'No frame carries a figure, a product, a room, a distance or a project of its own, so nothing can be carried across from them, and no bracket is ever left in the copy.',
    '',
    ...DESIGN_INTENT_SENTENCE_FRAMES.flatMap((entry) => [
      entry.label,
      entry.frame,
      `POPULATE FROM THIS PROJECT: ${entry.populate}.`,
      '',
    ]),
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
  'NEVER USE THESE WORDS AND PHRASES: remarkably; exceptional experience; serious cinema-scale; drawn into the action; becomes part of the scene; preserve their own tonal character; stable connection between sound and picture; substantial scale alongside quiet dialogue; calculated reserve to draw on; reserve to draw on; alongside its low-frequency output capability; effects have clear positions. Write with these instead: consistent; close; strong; substantial headroom; useful reserve; clear coverage; predicted response; tonal consistency. Never write "the render shows", "the visual confirms", "shown in the visual", "the approved interior" or "the finishes shown" either: state what the design does, never what a picture contains.',
  'DO NOT STACK STRONG ADJECTIVES AND NEVER REPEAT ONE. Excellent, exceptional, considerable, powerful and substantial are used only where this project\'s own evidence genuinely justifies them, and no paragraph carries more than one of them. Prefer close, strong, useful and consistent, and keep substantial headroom for headroom the evidence actually shows. PREFER THE EVIDENCE TO THE BENEFIT IT DESCRIBES: where the frozen evidence publishes a measured or modelled result, state that result instead of a general claim about the sound — the layout extends the predicted low-frequency response to the published figure, never the system provides powerful bass output.',
  'KEEP EACH PERFORMANCE POINT PRACTICAL AND GROUNDED. Timbre matching states that the screen, surround and overhead groups each maintain close tonal consistency within their respective layers and stops there. Dynamic range states substantial headroom from the screen channels at the reference position and useful reserve from the surround and overhead speakers, never considerable reserve around and overhead. The bass states the published extension and then what it gives the client — giving film soundtracks the depth and impact expected from a dedicated cinema — never supports the low notes and atmosphere of a film soundtrack, and never a sensation the evidence does not state.',
  'BASS IS THE PUBLISHED RESULT, NOT A FEELING. Where the frozen evidence publishes how low this design reaches, state it as the predicted response it is — the layout extends the predicted low-frequency response to the published figure — and then say in one short sentence what that gives the client in a film soundtrack. Never invent room gain, never describe bass as a sensation, and never put a subjective claim about weight or power in place of the extension the evidence publishes.',
  'WRITE THE THREE PARAGRAPHS IN THE APPROVED SENTENCE FRAMES BELOW. The frames are the register this copy is written in: take each frame as it stands and populate its brackets from this project\'s own frozen evidence. Spatial resolution names the layers this design actually has, the seat scope the evidence states that result for, and the tonal groups the evidence supports. Dynamic range states substantial headroom from the screen channels at the reference position and useful reserve from the surround and overhead speakers. Bass names this design\'s own subwoofer arrangement and this project\'s own extension figure, and uses the room-type vocabulary this room actually has. Prefer the frame unchanged and adapt it only where one of this project\'s facts makes the wording wrong, and then say the same thing in the same register. Variation is not a quality goal: accuracy, clarity and professional tone are.',
  'NEVER PARAPHRASE A FRAME INTO A WEAKER FORM OF THE SAME STATEMENT. Write "the seating is set forward of the rear wall to leave useful space behind the audience", never "not unused floor space" and never "part of how the room is arranged". Name the layers that provide the resolution and say what they cover, never "covering directions" and never "sound travels around the room". Write "dynamic capability is strong, with substantial headroom from the screen channels at the reference position and useful reserve from the surround and overhead speakers", never "predicted dynamic capability provides". State the arrangement that extends the predicted low-frequency response, never "combining bass depth with output capability" and never "demanding effects their impact". No bracket is ever left in the copy.',
  'RESERVE IS USEFUL RESERVE, AND NEVER A RESERVE TO DRAW ON. Never write "calculated reserve to draw on" and never write "reserve to draw on": the reserve the surround and overhead speakers provide is written as useful reserve, inside the sentence that says what it is there for. Never write "Alongside its low-frequency output capability" and never write "Effects have clear positions": state the capability and the coverage directly instead of attaching either to a noun phrase, and never describe effects as having positions of their own.',
  'THE BASS EXTENSION IS THIS PROJECT\'S OWN PUBLISHED FIGURE. Where the copy states how low this design reaches, take the extension from this project\'s own P18 evidence, state it as the predicted response it is, and name the arrangement it comes from. Never carry a figure across from another project and never state an extension the frozen evidence does not publish for this design.',
  'Translate the established engineering principles this design rests on into client benefits, confidently and in plain language. A principle may be explained confidently without a high Performance Level behind it.',
  'Where recorded designer intent is supplied, understand the engineering principle it explains and state it professionally in your own words. It is semantic input, never finished prose: never paraphrase the designer, and never reproduce a note, a brief, an instruction or a filename.',
  'Acoustic treatment is supporting evidence, never a selling point: never name a treatment product and never state a treatment quantity.',
  'Never invent a physical loudspeaker position, a designer decision or an achieved performance the frozen evidence does not record.',
  'THE PROJECT RENDERS ARE EXPERIENCE CONTEXT, NOT EVIDENCE. Where the writer is shown this project\'s concept visuals, they are there to help the client picture the room: they are not approved interior design, not a construction or interiors specification, and not a source of any technical fact. Write from them in at most ONE restrained place in this block, and only as the room the client is buying — the system designed as part of a complete cinema room, or the room intended to work as a place people want to spend time in. Keep the block what it is: an experienced cinema designer explaining the design.',
  'NEVER READ A FACT OUT OF A CONCEPT VISUAL, AND NEVER DESCRIBE ONE. Never determine the room type, the display, the seating count or arrangement, a loudspeaker count or position, a dimension or an architectural constraint from a picture, and never let what an image appears to show override what this project\'s own data states: canonical project and engineering data always wins. Never describe colours, fabrics, timber, stone, wall finishes, furniture, lighting, style, a luxury aesthetic or a contemporary or traditional look, and never imply that an interior shown is approved, final, specified or built. Where a finish or a material is genuinely part of the design, its wording comes from this project\'s own brief and never from a visual.',
  'NO RENDER DISCLAIMER IN THE COPY. The visuals carry their own label in the document, so never write a disclaimer about them into this block and never state in prose what a picture is or is not.',
  'SELL THE POSSIBILITY THE ROOM OFFERS, NEVER THE OBJECT A PICTURE SHOWS. A render may show a bar, casual secondary seating, cabinetry or a social space behind the main seats, and none of that is a requirement, a recommendation or a promise: it is illustrative only. Write about what the picture helps the client imagine, never about the object in the frame: a bar may suggest social flexibility, never a bar requirement; a large sofa may suggest relaxed family use, never a furniture specification; decorative lighting may suggest a room that feels special to spend time in, never a lighting design. Never present anything shown as approved, final, specified or built.',
  'THE ROOM IS FOR MORE THAN FILMS. The client is buying a complete room they will spend time in, not a list of equipment: day to day with family, and in more social use with friends. Where this project\'s own brief or recorded intent says so, shared use may be acknowledged as films, television, sport, music and concerts, gaming or simply time spent together; where nothing records a social or family use, keep the wording general, such as a room designed to be enjoyed regularly, and never invent family movie nights or entertaining friends. Keep it restrained and credible: this is an engineering report, not lifestyle marketing.',
  'Be positive, fluent and confident, in natural British English.',
  `Length: ${DESIGN_INTENT_TARGET_WORDS} words in three short paragraphs, and never more than the word limit. This block sits inside the report's fixed first-page budget, so it states what the design is and what it gives the client and then stops: paragraph one is the design reasoning, why the room is laid out the way it is; paragraph two develops spatial resolution and timbre matching; paragraph three develops dynamic range and the bass capability. Every fact the summary above this block already states stays out of it.`,
  designIntentSentenceFrameBlock(),
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