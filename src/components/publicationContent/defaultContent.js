/**
 * Default publication content — the fallback text shown when no custom
 * content has been published for a given content_key.
 *
 * These defaults are the original hard-coded copy extracted from the
 * About Sound Proof page and report page. They ensure the application
 * never displays an empty section.
 *
 * Each entry is plain HTML (no JSX) so it can be rendered identically
 * by the About page, Visual Report, Technical Report, and Proposal Centre.
 */

export const DEFAULT_ABOUT_SOUND_PROOF_HTML = `
<p>Sound Proof is a cinema design and performance prediction tool built around the principles of CEDIA RP22. It helps designers move beyond simply choosing loudspeakers and placing them in a room, and instead consider how the complete system is expected to perform for the people actually using it.</p>
<p>RP22 separates audio performance into three key areas: <strong>Dynamic Range, Spatial Resolution and Timbre Matching</strong>. In an ideal world, every parameter would achieve the highest possible level. In practice, real projects involve compromise. Aesthetic requirements may limit loudspeaker size or placement. Practical constraints may affect seating positions, room layout or available locations. Financial considerations may determine how far a system can be taken.</p>
<p>Sound Proof is designed to make those compromises <strong>visible and understandable</strong>.</p>
<p>Rather than presenting RP22 as a pass-or-fail exercise, the app helps the designer explain where limitations exist, what they mean in real terms, and what changes would improve the result. This creates a more informed conversation with the client, allowing decisions to be made consciously rather than by accident.</p>
<p>The objective is therefore <strong>not necessarily</strong> to force every parameter to Level 4. It is to achieve the <strong>highest appropriate</strong> performance level that the aesthetics, practicality and budget of the project allow. Done properly, that process leads to the right system for the room, the application and the client brief.</p>
<p>Sound Proof combines the strict recommendations and performance intent of RP22 with unique raw engineering data from <strong>Artcoustic Loudspeakers</strong>. Instead of relying on generic loudspeaker assumptions, it models real Artcoustic products, including dispersion, x-max, sensitivity, impedance, phase, frequency curves and more, and predicts their expected in-room behaviour, capability and performance.</p>
<p>The result is a design tool that brings together <strong>engineering credibility</strong> and <strong>client-facing clarity</strong>: helping professionals specify with greater confidence, demonstrate why a system has been designed in a particular way, and give clients a clear understanding of the choices behind their cinema.</p>
`;

/**
 * Registry of all known publication content keys and their defaults.
 * Future keys are added here. The admin CMS lists all keys from this
 * registry so the admin sees every manageable document even if no
 * PublicationContent record exists yet.
 */
export const PUBLICATION_CONTENT_REGISTRY = [
  {
    content_key: "about_sound_proof",
    title: "About Sound Proof",
    description: "The closing 'About Sound Proof' page shown in the app, Visual Report, Technical Report, and future proposals.",
    default_html: DEFAULT_ABOUT_SOUND_PROOF_HTML,
  },
];

/**
 * Returns the default HTML for a content key, or an empty string
 * if the key is not in the registry.
 */
export function getDefaultContentHtml(contentKey) {
  const entry = PUBLICATION_CONTENT_REGISTRY.find((e) => e.content_key === contentKey);
  return entry?.default_html || "";
}

/**
 * Returns the registry entry for a content key, or null.
 */
export function getRegistryEntry(contentKey) {
  return PUBLICATION_CONTENT_REGISTRY.find((e) => e.content_key === contentKey) || null;
}