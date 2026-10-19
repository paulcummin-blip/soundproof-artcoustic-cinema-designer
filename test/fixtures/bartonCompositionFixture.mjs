/**
 * BARTON SOLUTIONS — the frozen composition facts of the System Design Summary.
 * ---------------------------------------------------------------------------
 * Captured verbatim from proposal 6ad5c1d0abedf08469686ba4 (project
 * 6ad0ca85c8a64ec3cd8f7497, version 6ad0caa2373afd34bfaaa07d "Cinema Room") on
 * 2026-10-19: the six saved section bodies this document prints, the nine frozen
 * RP22 headline results its Highlights table states, the 9.3.6 design's own
 * system facts, and the six project images with the presentation and purpose the
 * designer recorded on each Library card.
 *
 * Captured so the page composition is exercised against the real document the
 * packed-page defect was reported on rather than against a paraphrase of it: the
 * Design Summary / Design Overview / Why This Specification blocks, the three
 * core sound sections, and the one Detail photograph (Spitfire Q6-3, recorded
 * Product detail) that used to be dropped into Spatial Resolution.
 *
 * Frozen data only. Nothing here is written back to the proposal.
 */

export const BARTON_PROPOSAL_ID = '6ad5c1d0abedf08469686ba4';
export const BARTON_PROJECT_ID = '6ad0ca85c8a64ec3cd8f7497';
export const BARTON_VERSION_ID = '6ad0caa2373afd34bfaaa07d';

/** The frozen facts the document is composed against (9.3.6, 15 discrete channels). */
export const BARTON_SNAPSHOT = {
  available: true,
  identity: {
    projectId: BARTON_PROJECT_ID,
    versionId: BARTON_VERSION_ID,
    project_name: 'Barton Solutions',
    client_name: 'Cheyne Walk',
    project_reference: 'Cinema Room',
    dealer_name: null,
    engineeringFingerprint: 'eng:v1:barton-composition-fixture',
    generatedAt: '2026-10-19T07:08:00.149Z',
  },
  project: { name: 'Barton Solutions', client_name: 'Cheyne Walk', project_reference: 'Cinema Room' },
  version: { id: BARTON_VERSION_ID, name: 'Cinema Room' },
  room: {
    dimensions: { length_m: 5, width_m: 4.22, height_m: 2.4 },
    classification: { statement: 'rectangular room' },
  },
  system: {
    channel_layout: {
      bed_channels: 9,
      overhead_channels: 6,
      dolby_subwoofer_channels: 3,
      total_discrete: 15,
      subwoofer_count: 3,
      configuration_text: '9.3.6 Dolby Atmos configuration (9 bed channels, 3 subwoofers, 6 overhead channels)',
    },
    configuration: { dolby_config: '9.1.6' },
  },
  rp22: {
    parameter_headlines: [
      { parameter_id: 2, level: 'L4', formatted_value: '15 speakers' },
      { parameter_id: 12, level: 'L4', formatted_value: '110 dBC' },
      { parameter_id: 13, level: 'L3', formatted_value: '102 dBC (FW)' },
      { parameter_id: 14, level: 'L3', formatted_value: '115 dBC' },
      { parameter_id: 16, level: 'L4', formatted_value: '\u00b10.5 dB' },
      { parameter_id: 17, level: 'L4', formatted_value: '\u22641.5 dB window' },
      { parameter_id: 18, level: 'L2', formatted_value: '22 Hz' },
      { parameter_id: 19, level: 'L4', formatted_value: '\u00b10 dB' },
      { parameter_id: 20, level: 'L1', formatted_value: '\u00b19.6 dB' },
    ],
  },
};

/** The six saved section bodies this document prints, verbatim. */
export const BARTON_SECTIONS = [
  {
    section_type: 'system_design_summary',
    title: 'System Design Summary',
    body: '<h2>Design Summary</h2><p>This dedicated cinema centres on a large projection image, with two rows of four seats arranged for film viewing. Within the room\u2019s compact rectangular proportions, the display and seating have been considered together: the picture is the focal point, with an immersive view from the rear row as well as the close relationship between the front row and the screen.</p><p>Sound extends beyond the picture through front-wide, side and rear loudspeakers, with dedicated overhead speakers above the audience. The screen channels sit behind the acoustically transparent projection screen, keeping the front soundstage physically connected to the image, while subwoofers at the front and rear support the soundtrack\u2019s low-frequency weight.</p><p>The seating is kept clear of the rear wall as a deliberate part of the arrangement. That space gives the surrounding loudspeakers room around the listeners and avoids placing the audience directly against a boundary that can make bass difficult to manage.</p><p>The aim is a reference-style cinema in which the picture has presence, the soundtrack reaches around the audience and demanding films have the scale they call for. The design treats the display, seating and sound as parts of the same film-watching experience.</p><h2>Design Overview</h2><p>Dialogue and on-screen action come from the loudspeakers behind the projection screen. Front wides occupy the transition towards the side surrounds, while rear surrounds carry sound behind the seating and overhead loudspeakers place the height effects above it.</p><p>Both seating rows face the front-wall image, with four places in each row. The bass arrangement comprises a subwoofer at the front and two at the rear, supporting the music and effects beneath the sound from the surrounding loudspeakers.</p><h2>Why This Specification</h2><p>For this dedicated cinema, the specification gives demanding film soundtracks substantial headroom while retaining a stable tonal character across the assessed seating. The screen stage carries the strongest output capability, appropriate to the dialogue, score and major effects concentrated at the picture, with strong reserve in the surround and overhead channels for the action extending beyond it.</p><p>The value of the loudspeaker layout is in its placement as well as its capability. Front wides link the screen stage to the sides, and speaker spacing is great across the primary seats, supporting clear movement between the screen and side channels.</p><p>Bass is an important part of that scale. The front-and-rear subwoofer arrangement is intended to manage the room\u2019s low-frequency resonances, while the specified output capability supplies the weight needed for forceful effects and musical climaxes at the reference seating position.</p>',
  },
  {
    section_type: 'spatial_resolution',
    title: 'Spatial Resolution',
    body: '<p>An effect can stay connected to the picture before travelling out towards the audience, with the screen speakers, front wides and side surrounds providing its path. Above the seating, dedicated overhead positions give rain, aircraft and other height effects a place beyond the image.</p><p>Movement across the primary listening positions benefits from great horizontal speaker spacing, while great overhead spacing across the primary seats supports the passage of sound above them. Overhead level consistency is great across the primary seats, helping the height layer remain balanced across the main listening positions.</p><p>The picture has a strong presence from the rear row: its 44.7\u00b0 viewing angle gives those seats an immersive view of the projection screen. Together with the sound extending to the sides, behind and overhead, that viewing relationship makes the rear row part of the action.</p>',
  },
  {
    section_type: 'dynamic_range',
    title: 'Dynamic Range',
    body: '<p>The move from a quiet exchange or delicate score to a sudden, large-scale effect is central to the experience this cinema is designed to convey. Strong predicted output capability across the front stage, surrounds and bass provides the reserve for the demanding end of that contrast.</p><p>The screen channels have exceptional headroom for the moments when dialogue, music and effects build together. Substantial reserve in the surround and overhead channels supports the accompanying activity around and above the audience, such as an action sequence spreading beyond the picture.</p><p>Underneath those moments, the subwoofer system provides strong predicted low-frequency output at the reference seating position. It gives explosions and forceful musical passages the weight and impact that make a major peak feel distinct from the quiet passage preceding it.</p>',
  },
  {
    section_type: 'timbre_matching',
    title: 'Timbre Matching',
    body: '<p>The tonal aim is for a voice or effect to retain its familiar character as the loudspeakers hand it on, keeping attention on the scene. Across the primary seats, the screen channels have excellent tonal consistency, so dialogue and instruments retain a stable tonal balance from one of those positions to another.</p><p>The surround and overhead channels also have excellent tonal consistency across the primary seats, preserving their own character around and above the listeners. Strong tonal consistency extends across all eight assessed positions within each of these speaker groups, an important quality in a cinema with two seating rows.</p>',
  },
  {
    section_type: 'key_performance_highlights',
    title: 'Key Performance Highlights',
    body: '<p>Voices and instruments retain a stable tonal balance across the assessed seats within the screen speaker group; the surround and overhead groups also hold their own tonal character across those positions.</p><p>The front stage provides exceptional headroom for demanding musical and effects peaks, supported by substantial surround and overhead reserve. Strong bass output at the reference seating position gives those moments weight and impact.</p><p>Across the primary seats, excellent screen-channel level consistency supports a centred front image, while great overhead level consistency helps keep the height effects balanced.</p>',
  },
  {
    section_type: 'overall_design',
    title: 'Overall Design',
    body: '<p>This cinema\u2019s appeal is the relationship between a substantial projected image and a soundtrack that can reach beyond its edges. From the rear row, the picture still fills an immersive part of the view; around the primary seats, the loudspeaker spacing supports clear movement into the sides and overhead.</p><p>Stable tonal character within the screen and surround groups gives voices and instruments continuity across the assessed listening positions. When the film turns from conversation to a busy action sequence, the specified front-stage reserve and strong bass capability provide the scale to accompany that change, giving the large picture a soundtrack with matching ambition.</p>',
  },
  { section_type: 'room_images', title: 'Project Images', body: '' },
];

/** The saved key performance rows the section metadata carries, verbatim. */
export const BARTON_HIGHLIGHT_ROWS = [
  { key: 'screen_size', area: 'Screen', result: '120" 2.35:1' },
  { key: 'rp23_viewing', area: 'RP23 viewing', result: 'Viewing angles calculated for 8 seats. Horizontal viewing angle ranges from 45\u00b0 to 77\u00b0.' },
  { key: 'system_layout', area: 'System layout', result: '9.3.6' },
  { key: 'p2', area: 'Discrete channels', result: 'L4 \u00b7 15 speakers' },
  { key: 'p4', area: 'Screen consistency', result: 'L3 \u00b7 3 dB' },
  { key: 'p5', area: 'Horizontal spacing', result: 'L1 \u00b7 109\u00b0' },
  { key: 'p7', area: 'Front wide position', result: 'L4 \u00b7 0' },
  { key: 'p9', area: 'Overhead spacing', result: 'L2 \u00b7 65.7\u00b0' },
  { key: 'p12', area: 'Screen Dynamic Range', result: 'L4 \u00b7 110 dBC' },
  { key: 'p13', area: 'Non-screen Dynamic Range', result: 'L3 \u00b7 102 dBC (FW)' },
  { key: 'p14', area: 'LFE and subwoofer Dynamic Range', result: 'L3 \u00b7 115 dBC' },
  { key: 'p18', area: 'Bass extension', result: 'L2 \u00b7 22 Hz' },
  { key: 'p19', area: 'Bass response', result: 'L4 \u00b7 \u00b10 dB' },
  { key: 'p16', area: 'Screen timbre', result: 'L4 \u00b7 \u00b10.5 dB' },
];

/**
 * The six Library images as the designer's own cards state them: five Full Width
 * whole-room photographs, and one Detail photograph of the screen speakers,
 * recorded as a Product detail — Spitfire Q6-3 — and PLACED WITH Dynamic Range,
 * which is the section the designer chose for it on its own card.
 */
export const BARTON_IMAGES = [
  {
    id: 'barton-image-cover',
    file_url: 'https://example.test/barton/cover.jpg',
    slot: 'cover',
    caption: '',
    image_presentation: 'full_width',
    image_purpose: 'whole_room',
  },
  {
    id: 'barton-image-1',
    file_url: 'https://example.test/barton/image-1.jpg',
    slot: 'image_1',
    caption: '',
    image_presentation: 'full_width',
    image_purpose: 'whole_room',
  },
  {
    id: 'barton-image-2',
    file_url: 'https://example.test/barton/image-2.jpg',
    slot: 'image_2',
    caption: '',
    image_presentation: 'full_width',
    image_purpose: 'whole_room',
  },
  {
    id: 'barton-image-3',
    file_url: 'https://example.test/barton/image-3.jpg',
    slot: 'image_3',
    caption: '',
    image_presentation: 'full_width',
    image_purpose: 'whole_room',
  },
  {
    id: 'barton-image-4',
    file_url: 'https://example.test/barton/image-4.jpg',
    slot: 'image_4',
    caption: '',
    image_presentation: 'full_width',
    image_purpose: 'whole_room',
  },
  {
    id: 'barton-image-q6-3',
    file_url: 'https://example.test/barton/image-5.jpg',
    slot: 'image_5',
    caption: 'Spitfire Q6-3',
    image_presentation: 'detail',
    image_purpose: 'product_detail',
    // PLACE WITH — the only authority for an Inline Detail image's section.
    section_target: 'dynamic_range',
  },
];

/** The section records as the Editor and the pack receive them. */
export function bartonSections() {
  return BARTON_SECTIONS.map((section, index) => ({
    id: `barton-section-${index}`,
    proposal_id: BARTON_PROPOSAL_ID,
    section_type: section.section_type,
    section_key: section.section_type,
    title: section.title,
    body: section.body,
    is_enabled: true,
    order_index: index,
    dealer_notes: '',
    metadata: section.section_type === 'key_performance_highlights'
      ? { highlight_rows: BARTON_HIGHLIGHT_ROWS }
      : {},
  }));
}

export function bartonProposal() {
  return {
    id: BARTON_PROPOSAL_ID,
    project_id: BARTON_PROJECT_ID,
    proposal_type: 'system_summary',
    status: 'generated',
    title: 'Barton Solutions',
    selected_version_ids: [BARTON_VERSION_ID],
    engineering_snapshot: BARTON_SNAPSHOT,
  };
}

/** The exact props the export composes the Barton pack with. */
export function bartonPackProps() {
  return {
    proposal: bartonProposal(),
    projectName: 'Barton Solutions',
    dealerName: null,
    projectReference: 'Cinema Room',
    versionNames: ['Cinema Room'],
    coverImageUrl: BARTON_IMAGES[0].file_url,
    heroImageUrl: null,
    logoUrl: null,
    sections: bartonSections(),
    validatedOptionsCopy: '',
    projectImages: BARTON_IMAGES,
    recoveredComparisonTable: null,
  };
}