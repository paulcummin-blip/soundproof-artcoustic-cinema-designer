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
 * the purpose it serves, the project's own facts it is written from, the plain
 * register it is written in, the words and phrases it never uses, and the length
 * it may run to on the report's first page.
 *
 * THE CONTENT BRIEF, NOT SENTENCE FRAMES. The brief states what the Design Intent
 * explains — the design choices, the relationship between the picture and the
 * sound, the meaningful performance strengths, and any limitations relevant to the
 * client — and lets Astra decide which supported details deserve emphasis and how
 * to organise the narrative. No fixed opening, paragraph sequence or conclusion is
 * imposed, so each project can read differently because its design is different.
 * The factual safeguards, source-evidence restrictions and prohibited claims
 * below are preserved exactly: they govern what may be claimed, never how it must
 * be sequenced.
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
 * THE DESIGN INTENT CONTENT BRIEF.
 *
 * A concise statement of what the Design Intent explains, replacing the former
 * literal sentence frames. It preserves the purpose of the block — the design
 * choices, the picture-and-sound relationship, the performance strengths and the
 * limitations relevant to the client — while letting Astra decide which supported
 * details deserve emphasis and how to organise the narrative. No fixed opening,
 * paragraph sequence or conclusion is imposed.
 */
export const DESIGN_INTENT_CONTENT_BRIEF = [
  'THE DESIGN INTENT CONTENT BRIEF: explain the design choices, the relationship between the picture and the sound, the meaningful performance strengths, and any limitations relevant to the client.',
  'Write it as an experienced home cinema designer talking the client through the design.',
  'Choose which supported details deserve emphasis and organise the narrative so each project reads differently because its design is different. No fixed opening, paragraph sequence or conclusion is imposed: the content and the evidence the frozen pack supplies guide the order that reads most naturally for this room.',
  'The three performance ideas the block may draw on are spatial resolution, timbre matching and dynamic range, developed as prose and never as headings or a list. The detailed design decisions, where this project records them, are explained where they fit the narrative, never forced into a fixed position.',
].join(' ');

/**
 * The Design Intent's own instruction. It states the purpose the block serves, the
 * project facts it is written from, the plain register it is written in, what it
 * never recites and what it never invents, and the length it may run to on the
 * report's first page. The factual safeguards, source-evidence restrictions and
 * prohibited claims are preserved; the rigid paragraph structure and literal
 * sentence frames are removed, so Astra develops the narrative from this
 * project's own frozen evidence in the order that reads most naturally.
 */
export const DESIGN_INTENT_REQUIREMENT = [
  'This block is the report\'s Design Intent: it opens the Project Report above its facts sheet, and it is written for the client as the design team\'s own account of the design.',
  'Explain the design choices, the relationship between the picture and the sound, the meaningful performance strengths, and any limitations relevant to the client. Write it as an experienced home cinema designer talking the client through the design, and never announce a recommendation: never open on a formulaic phrase such as "Our recommendation is" or "We recommend".',
  DESIGN_INTENT_CONTENT_BRIEF,
  'The experience leads and the engineering follows, but no fixed order is imposed beyond that: move naturally between what has been specified, why the approach is appropriate, what it is intended to provide and what the frozen evidence supports, vary that progression from subject to subject, and never give each form of knowledge its own formulaic sentence.',
  'NEVER CLAIM THE SAME EXPERIENCE AT EVERY SEAT. Describe the picture scale the seating sits within and the coverage this project\'s own evidence supports, and never write that every seat sees the same picture or hears the same performance unless this project\'s own RP22 or RP23 results state it for those seats. Never use a generic phrase such as "cinematic scale across the seating": state the actual screen size, viewing angle and RP23 level the evidence publishes.',
  'DRIVE THE COPY WITH THIS PROJECT\'S OWN FACTS, taken from the frozen evidence and cited to the claim each one rests on. The Project Summary and the evidence pages state the specification in full, so this block states the few facts it actually explains rather than reciting them. Name a product model only where the frozen evidence states it for this design.',
  'NEVER REPEAT THE SUMMARY ABOVE THIS BLOCK. The Project Summary immediately above this copy already states the room dimensions, the display and its format, the seating rows, the system format, the screen channels, the surrounds, the overheads and the subwoofers, and the evidence pages beside it state the results in full. Mention a fact only where it helps explain why the design works, and the channel list earns nothing.',
  'Then never recite the specification: no equipment-by-equipment schedule, no repeated room dimensions, no Performance Level, no parameter name or code, no channel-by-channel account, and no output figure the client can already read on the evidence pages beside this block.',
  'The three performance ideas the block may draw on are SPATIAL RESOLUTION, TIMBRE MATCHING and DYNAMIC RANGE, developed as prose, never as headings, never as a list and never one paragraph per idea. SPATIAL RESOLUTION is how the loudspeaker arrangement carries sound around and above the seating, and how consistent the front soundstage is across the primary seats. TIMBRE MATCHING is how the loudspeaker layers hold their own tonal balance, stated for the layer and the seats those results cover. DYNAMIC RANGE is how much headroom the front stage, the surround and overhead layers and the bass system have for demanding film soundtracks. Develop whichever of these this design\'s evidence supports, in the order that reads most naturally for this room.',
  'Make each idea specific and evidence-led: name the loudspeaker layers and channels THIS design actually has — the front wides, the surrounds, the rear surrounds, the overhead channels — and say what they cover around and above the seating, how the screen channels hold the front soundstage across the primary seats, and what the primary-seat results show. State the resolution, then explain what produces it. TIMBRE MATCHING is written in plain, credible language: the screen, surround and overhead groups each maintain close tonal consistency within their respective layers, and a stronger form such as excellent tonal consistency is used only where the authoritative evidence supports it. DYNAMIC RANGE is the whole system\'s capability, explained from the authoritative evidence behind it — the headroom the screen channels have at the reference position, useful reserve from the surround and overhead speakers, and what the bass system adds — and never as a vague impression of scale or power.',
  'State a measured result only where the frozen evidence states it and only at the scope that result covers. An intention is never written as an achieved result, and a measured or calculated result is never written as an intention.',
  'Write plainly and concretely: short direct sentences, active voice, practical design reasoning, and specifics this project\'s own evidence states. Describe what the loudspeakers do and where the client sits and listens, never what the sound is like as a feeling: no figurative or anthropomorphic language about sound, no metaphor, no cinematic cliche, no vague claim about immersion and no marketing language. Explain each point once, add no filler, and never explain the same idea twice in different words.',
  'WRITE AS THE DESIGNER WHO MADE THE DECISIONS, NOT A SYSTEM IMPRESSING THE READER. Use the actual screen size, seating row arrangement, viewing angle, RP23 level, loudspeaker configuration and calculated performance figures this project\'s evidence carries. Describe the seating as a row arrangement, never an exact seat count or a people-per-row figure, unless the client brief explicitly specifies a physical capacity. Each project must read differently because its design is different: a single seating row at 51° is a different sentence from two rows at 45° and 56°. State the figure, then the benefit it delivers, in the natural register of an experienced professional explaining their own work. Never replace a specific figure with a poetic abstraction, so "a 51° viewing angle" is right and "the picture fills the eye" is wrong. Acknowledge a genuine design compromise plainly, without presenting every lower performance level as a failure.',
  'NEVER USE THESE WORDS AND PHRASES: remarkably; exceptional experience; serious cinema-scale; drawn into the action; becomes part of the scene; preserve their own tonal character; stable connection between sound and picture; substantial scale alongside quiet dialogue; calculated reserve to draw on; reserve to draw on; alongside its low-frequency output capability; effects have clear positions; the picture fills the eye; carries the same presence; reads at its intended scale; chosen by eye; the whole frame is read at once rather than scanned; holds the attention; immersive sound; strong cinematic scale; powerful dynamics. Write with these instead: consistent; close; strong; substantial headroom; useful reserve; clear coverage; predicted response; tonal consistency. Never write "the render shows", "the visual confirms", "shown in the visual", "the approved interior" or "the finishes shown" either: state what the design does, never what a picture contains.',
  'NEVER WRITE A VAGUE "MAKES THE MOST OF IT" CLAIM. Never write "arranged to make the most of it", "to make the most of the screen", "works well together", "makes good use of the space", "maximises the experience" or "creates the best experience". State the design relationship itself instead: the screen size, the seating distance, the row arrangement and the picture scale. Say what the arrangement does for the picture and the room, never that the room has been made the most of. A vague claim about using the space well is a defect: the copy states the relationship between the display and where the audience sits, in the same register as the rest of the block.',
  'DO NOT STACK STRONG ADJECTIVES AND NEVER REPEAT ONE. Excellent, exceptional, considerable, powerful and substantial are used only where this project\'s own evidence genuinely justifies them, and no paragraph carries more than one of them. Prefer close, strong, useful and consistent, and keep substantial headroom for headroom the evidence actually shows. PREFER THE EVIDENCE TO THE BENEFIT IT DESCRIBES: where the frozen evidence publishes a measured or modelled result, state that result instead of a general claim about the sound.',
  'KEEP EACH PERFORMANCE POINT PRACTICAL AND GROUNDED. Timbre matching states that the screen, surround and overhead groups each maintain close tonal consistency within their respective layers and stops there. Dynamic range states substantial headroom from the screen channels at the reference position and useful reserve from the surround and overhead speakers. The bass states the published extension and then what it gives the client, never a sensation the evidence does not state.',
  'BASS IS THE PUBLISHED RESULT, NOT A FEELING. Where the frozen evidence publishes how low this design reaches, state it as the predicted response it is — the layout extends the predicted low-frequency response to the published figure — and then say in one short sentence what that gives the client in a film soundtrack. Never invent room gain, never describe bass as a sensation, and never put a subjective claim about weight or power in place of the extension the evidence publishes.',
  'RESERVE IS USEFUL RESERVE, AND NEVER A RESERVE TO DRAW ON. Never write "calculated reserve to draw on" and never write "reserve to draw on": the reserve the surround and overhead speakers provide is written as useful reserve, inside the sentence that says what it is there for. Never write "Alongside its low-frequency output capability" and never write "Effects have clear positions": state the capability and the coverage directly instead of attaching either to a noun phrase, and never describe effects as having positions of their own.',
  'NEVER USE THESE WEAKER PARAPHRASES: "not unused floor space"; "part of how the room is arranged"; "covering directions"; "sound travels around the room"; "predicted dynamic capability provides"; "combining bass depth with output capability"; "demanding effects their impact". State the design relationship directly instead: the seating set forward of the rear wall to leave useful space behind the audience; the layers that carry sound around and above the seating; the substantial headroom from the screen channels at the reference position; the arrangement that extends the predicted low-frequency response.',
  'THE BASS EXTENSION IS THIS PROJECT\'S OWN PUBLISHED FIGURE. Where the copy states how low this design reaches, take the extension from this project\'s own P18 evidence, state it as the predicted response it is, and name this design\'s own subwoofer arrangement it comes from. Never carry a figure across from another project and never state an extension the frozen evidence does not publish for this design.',
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
  `Length: ${DESIGN_INTENT_TARGET_WORDS} words in a few short paragraphs, and never more than the word limit. This block sits inside the report's fixed first-page budget, so it states what the design is and what it gives the client and then stops. Every fact the summary above this block already states stays out of it, except where it helps explain why the design works.`,
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