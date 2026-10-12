/**
 * GENESIS AV — the frozen approved proposal copy and image option set.
 * ------------------------------------------------------------------
 * Read live from proposal 6acc7b654a1774c83cddeae4 (project
 * 6ac7a0ae9f28aaf668e20ccc, version 6ac7a189d093a8d8a68eec91 "Original Design")
 * on 2026-10-12 and captured VERBATIM: the ten saved section bodies, the five
 * gallery images with their comparison markings and the designer's own raw
 * notes, and the 15-discrete-channel facts of the 9.1.6 design.
 *
 * Captured so the publication and preview acceptance suite is exercised against
 * the real approved prose rather than a paraphrase of it: the ten validated
 * prose paragraphs the proposal was generated with, the highlights
 * introduction, the centre-channel sentence and the two seating alternatives
 * are the ones this document really publishes.
 *
 * Frozen data only. Nothing here is written back to the proposal.
 */

export const GENESIS_PROPOSAL_ID = '6acc7b654a1774c83cddeae4';
export const GENESIS_PROJECT_ID = '6ac7a0ae9f28aaf668e20ccc';
export const GENESIS_VERSION_ID = '6ac7a189d093a8d8a68eec91';

/** The real snapshot facts the document is composed against (9.1.6, 15 discrete channels). */
export const GENESIS_SNAPSHOT = {
  available: true,
  identity: {
    projectId: GENESIS_PROJECT_ID,
    versionId: GENESIS_VERSION_ID,
    project_name: 'Genesis AV',
    client_name: null,
    project_reference: null,
    dealer_name: null,
    engineeringFingerprint: 'eng:v1:5739e42a60819e44',
    generatedAt: '2026-10-11T15:12:55.161Z',
  },
  project: { name: 'Genesis AV', client_name: null, project_reference: null },
  version: { id: GENESIS_VERSION_ID, name: 'Original Design' },
  room: {
    dimensions: { length_m: 5.09, width_m: 4.64, height_m: 2.6 },
    classification: { statement: 'rectangular room' },
  },
  system: {
    channel_layout: {
      bed_channels: 9,
      overhead_channels: 6,
      dolby_subwoofer_channels: 1,
      total_discrete: 15,
      subwoofer_count: 4,
      configuration_text: '9.1.6 Dolby Atmos configuration (9 bed channels, 1 subwoofer, 6 overhead channels)',
    },
    configuration: { dolby_config: '9.1.6' },
  },
};

/** The ten saved section bodies, verbatim. */
export const GENESIS_SECTIONS = [
  { section_type: 'cover', title: 'Cover', body: '' },
  {
    section_type: 'system_design_summary',
    title: 'System Design Summary',
    body: '<h2>Design Summary</h2><p>Voices and effects retain their tonal character as they travel from the screen to the surrounds and overhead, helping the soundtrack feel coherent as it moves around the room. The 115" TV and 9.1.6 layout bring that sound into a dedicated cinema setting, with four subwoofers specified for physical low-frequency impact.</p><h2>Design Overview</h2><p>The room is arranged around a 115" TV and a 9.1.6 sound system, with six overhead speakers and four subwoofers supporting effects above and around the audience. At the front, Q6-3 speakers serve left and right, while two C4-1 cabinets reproduce the single centre channel.</p><h2>Why This Specification</h2><p>Sound can move above and around the audience rather than remaining at the picture; this movement is supported by the 9.1.6 layout, including six overhead speakers and four subwoofers. Voices and effects also keep a consistent tonal character as they cross between screen, surround and overhead channels, across all 8 assessed seating positions.</p>',
  },
  {
    section_type: 'spatial_resolution',
    title: 'Spatial Resolution',
    body: '<p>The front row is positioned to make the most of the 115" TV, with a 57.3\u00b0 viewing angle for an immersive picture. Around the room, the screen-wall speakers sit within their recommended zones, and the wide and surround speakers are positioned within their recommended limits.</p>',
  },
  {
    section_type: 'dynamic_range',
    title: 'Dynamic Range',
    body: '<p>Low-frequency effects can carry physical weight in demanding scenes, giving major impacts and musical passages a strong bass foundation. The four-subwoofer system is specified to deliver 115 dBC of low-frequency output at the reference seating position.</p>',
  },
  {
    section_type: 'timbre_matching',
    title: 'Timbre Matching',
    body: '<p>Voices and effects keep a consistent tonal character as they move from the screen channels to the surrounds and overhead channels. That tonal consistency holds across all 8 assessed seating positions, helping a sound that moves through the cinema retain its character.</p>',
  },
  {
    section_type: 'key_performance_highlights',
    title: 'Key Performance Highlights',
    body: '<p>Voices and effects retain their tonal character as they pass between the screen, surround and overhead channels. The immersive layout gives filmmakers room to place sound above and around the audience, while the subwoofer system is specified to give low-frequency effects physical weight.</p>',
  },
  {
    section_type: 'overall_design',
    title: 'Overall Design',
    body: '<p>The front row\u2019s view of the 115" TV is paired with sound that can travel around and above the audience, while voices and effects retain their tonal character across the seating positions. Four subwoofers provide the specified low-frequency authority for the weight and impact of demanding film soundtracks.</p>',
  },
  { section_type: 'room_images', title: 'Project Images', body: '' },
  {
    section_type: 'presented_options',
    title: 'Presented Options',
    body: '<p>Formal cinema seating brings reclining seats and cupholders; relaxed sofas create a more informal setting and allow more flexible seating. Either arrangement works within the seating positions specified for this design, so the choice comes down to comfort and personal preference; predicted acoustic performance is unchanged provided the assessed listening positions and relevant room geometry are maintained.</p>',
  },
  {
    section_type: 'appendix',
    title: 'Appendix',
    body: '<p>This proposal is based on the frozen Project Report for this design. Detailed RP22, RP23, product and room evidence is available in the accompanying report.</p>',
  },
];

/** The five gallery images, verbatim — including which two the designer marked as a comparison. */
export const GENESIS_ASSETS = [
  {
    id: 'genesis-cover',
    slot: 'cover',
    file_url: 'https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/704681f3e_Image21.png',
    caption: '', usage: 'gallery', scope: 'project', proposal_importance: 'Preferred',
    seating_style: null, comparison_enabled: false, comparison_group: null, comparison_option_label: null,
    order_index: 0,
  },
  {
    id: 'genesis-image-1',
    slot: 'image_1',
    file_url: 'https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/0f8e408f5_Image.png',
    caption: '', usage: 'gallery', scope: 'project', proposal_importance: 'Preferred',
    seating_style: null, comparison_enabled: false, comparison_group: null, comparison_option_label: null,
    order_index: 1,
  },
  {
    id: 'genesis-image-2',
    slot: 'image_2',
    file_url: 'https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/ce1af49e2_Image3.png',
    caption: '', usage: 'gallery', scope: 'project', proposal_importance: 'Preferred',
    seating_style: null, comparison_enabled: false, comparison_group: null, comparison_option_label: null,
    order_index: 2,
  },
  {
    id: 'genesis-image-formal-seating',
    slot: 'image_3',
    file_url: 'https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/1bb41c1d9_Image6.png',
    caption: '', usage: 'gallery', scope: 'project', proposal_importance: 'Preferred',
    seating_style: null, comparison_enabled: true, comparison_group: 'Seating',
    comparison_option_label: 'Formal Cinema Seating', order_index: 3,
  },
  {
    id: 'genesis-image-relaxed-sofas',
    slot: 'image_4',
    file_url: 'https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/f2d9994aa_Image9.png',
    caption: '', usage: 'gallery', scope: 'project', proposal_importance: 'Preferred',
    seating_style: null, comparison_enabled: true, comparison_group: 'Seating',
    comparison_option_label: 'Relaxed Sofas', order_index: 4,
  },
];

/**
 * The designer's own raw notes, stored on the two comparison images. They are
 * editorial guidance to the writer and must never reach the client document.
 */
export const GENESIS_COMPARISON_NOTES = [
  'Seating is a personal preference, with with formal cinema seats or more relaxed sofa seating both being great options. Sofa style seating will allow for a more flexible number of people to enjoy the room, but reclining cinema seats are sometime a prefered choice. The performance of the system isnt compromised by either, this remains a personal choice only',
  'The choice of seating is entirely up the the client, and two styles are shown here, one with formal cinema seating, with reclining motorised seating and cupholders. Sofas are increasingly used in high end cinema rooms and can be a more relaxed and inviting option. Sofa seating allows for a more flexible seating with it much easier to have additional people enjoy the room',
];

/** The centre-channel sentence: the validated copy a published page once lost. */
export const GENESIS_CENTRE_SENTENCE = 'At the front, Q6-3 speakers serve left and right, while two C4-1 cabinets reproduce the single centre channel.';

/** The ten validated prose paragraphs the proposal was generated with, one entry each. */
export const GENESIS_PARAGRAPHS = GENESIS_SECTIONS
  .filter((section) => section.body.trim())
  .flatMap((section) => section.body
    .split(/<\/p>/i)
    .map((chunk) => chunk.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({ section_type: section.section_type, text })));

/** The section records as the Editor and the pack receive them. */
export function genesisSections() {
  return GENESIS_SECTIONS.map((section, index) => ({
    id: `genesis-section-${index}`,
    proposal_id: GENESIS_PROPOSAL_ID,
    section_type: section.section_type,
    section_key: section.section_type,
    title: section.title,
    body: section.body,
    is_enabled: true,
    order_index: index,
    dealer_notes: '',
    metadata: {},
  }));
}

export function genesisProposal() {
  return {
    id: GENESIS_PROPOSAL_ID,
    project_id: GENESIS_PROJECT_ID,
    proposal_type: 'system_summary',
    status: 'generated',
    title: 'Genesis AV',
    selected_version_ids: [GENESIS_VERSION_ID],
    engineering_snapshot: GENESIS_SNAPSHOT,
  };
}

/** The exact props the editor mounts ProposalPrintDocument with, for the real proposal. */
export function genesisPackProps() {
  const sections = genesisSections();
  return {
    proposal: genesisProposal(),
    projectName: 'Genesis AV',
    dealerName: null,
    projectReference: null,
    versionNames: ['Original Design'],
    coverImageUrl: GENESIS_ASSETS.find((asset) => asset.slot === 'cover').file_url,
    heroImageUrl: null,
    logoUrl: null,
    sections,
    validatedOptionsCopy: validatedOptionsForGenesis(sections),
    projectImages: GENESIS_ASSETS,
    recoveredComparisonTable: null,
  };
}

/** The validated options text the section carries — the same source the Editor uses. */
export function validatedOptionsForGenesis(sections = genesisSections()) {
  const options = sections.find((section) => section.section_type === 'presented_options');
  return options ? options.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}