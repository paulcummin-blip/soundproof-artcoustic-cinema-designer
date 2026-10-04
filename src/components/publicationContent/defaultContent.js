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
<p>Sound Proof is a professional home cinema design assistant built around the engineering principles of CEDIA RP22.</p>
<p>Its purpose is to help designers, integrators and dealers make better engineering decisions before a cinema is built. It predicts how a complete system is expected to perform, then presents those decisions in a way that can be explained clearly to clients.</p>
<p>Sound Proof evaluates the cinema as a system. Room geometry, seating layout, loudspeaker selection, subwoofer placement, calibration prediction and acoustic performance are considered together.</p>
<p>The RP22 parameters are not the objective of the design process. They are the evidence used to validate the quality of the design.</p>
<p>The goal is not to force every room to Level 4. The goal is to achieve the highest appropriate performance that the room, the application, the aesthetics and the available budget allow.</p>
<p>Sound Proof combines the performance intent of RP22 with detailed engineering data from Artcoustic Loudspeakers, so the design is based on real product behaviour rather than generic assumptions.</p>
<p>Predicted performance should always be confirmed by final calibration on site.</p>
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