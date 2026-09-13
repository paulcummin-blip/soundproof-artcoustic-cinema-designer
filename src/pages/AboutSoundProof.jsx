import React from "react";

const BRAND_GREEN = "#213428";
const TEXT_DARK = "#1B1A1A";
const TEXT_BODY = "#3E4349";
const TEXT_MUTED = "#625143";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";

const PARAGRAPHS = [
  {
    key: "intro",
    content: (
      <>
        Sound Proof is a cinema design and performance prediction tool built
        around the principles of CEDIA RP22. It helps designers move beyond
        simply choosing loudspeakers and placing them in a room, and instead
        consider how the complete system is expected to perform for the people
        actually using it.
      </>
    ),
  },
  {
    key: "three-areas",
    content: (
      <>
        RP22 separates audio performance into three key areas:{" "}
        <strong>Dynamic Range, Spatial Resolution and Timbre Matching</strong>.
        In an ideal world, every parameter would achieve the highest possible
        level. In practice, real projects involve compromise. Aesthetic
        requirements may limit loudspeaker size or placement. Practical
        constraints may affect seating positions, room layout or available
        locations. Financial considerations may determine how far a system can
        be taken.
      </>
    ),
  },
  {
    key: "visible",
    content: (
      <>
        Sound Proof is designed to make those compromises{" "}
        <strong>visible and understandable</strong>.
      </>
    ),
  },
  {
    key: "not-pass-fail",
    content: (
      <>
        Rather than presenting RP22 as a pass-or-fail exercise, the app helps
        the designer explain where limitations exist, what they mean in real
        terms, and what changes would improve the result. This creates a more
        informed conversation with the client, allowing decisions to be made
        consciously rather than by accident.
      </>
    ),
  },
  {
    key: "objective",
    content: (
      <>
        The objective is therefore <strong>not necessarily</strong> to force
        every parameter to Level 4. It is to achieve the{" "}
        <strong>highest appropriate</strong> performance level that the
        aesthetics, practicality and budget of the project allow. Done
        properly, that process leads to the right system for the room, the
        application and the client brief.
      </>
    ),
  },
  {
    key: "artcoustic",
    content: (
      <>
        Sound Proof combines the strict recommendations and performance intent
        of RP22 with unique raw engineering data from Artcoustic Loudspeakers.
        Instead of relying on generic loudspeaker assumptions, it models real
        Artcoustic products, including dispersion, x-max, sensitivity,
        impedance, phase, frequency curves and more, and predicts their
        expected in-room behaviour, capability and performance.
      </>
    ),
  },
  {
    key: "result",
    content: (
      <>
        The result is a design tool that brings together{" "}
        <strong>engineering credibility</strong> and{" "}
        <strong>client-facing clarity</strong>: helping professionals specify
        with greater confidence, demonstrate why a system has been designed in
        a particular way, and give clients a clear understanding of the choices
        behind their cinema.
      </>
    ),
  },
];

export default function AboutSoundProof() {
  return (
    <div
      className="w-full min-h-full flex justify-center px-4 py-8 sm:py-12"
      style={{ background: "transparent" }}
    >
      <div
        className="relative bg-white shadow-sm"
        style={{
          width: "100%",
          maxWidth: "210mm",
          minHeight: "297mm",
          borderLeft: `3px solid ${BRAND_GREEN}`,
          borderRadius: "2px",
          padding: "clamp(24px, 6vw, 64px) clamp(28px, 7vw, 80px)",
        }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img
            src={LOGO_URL}
            alt="Sound Proof"
            style={{
              maxWidth: 280,
              width: "60%",
              objectFit: "contain",
            }}
          />
        </div>

        {/* Thin brand-colour line */}
        <div
          className="mx-auto mb-10"
          style={{
            width: "40%",
            maxWidth: 200,
            height: 2,
            background: BRAND_GREEN,
          }}
        />

        {/* Heading */}
        <h1
          className="text-center mb-10"
          style={{
            fontFamily: "'Didact Gothic', sans-serif",
            fontSize: "clamp(20px, 3vw, 26px)",
            fontWeight: 600,
            color: TEXT_DARK,
            letterSpacing: "0.02em",
          }}
        >
          About Sound Proof
        </h1>

        {/* Body copy */}
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            fontFamily:
              "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: "clamp(14px, 1.1vw, 15.5px)",
            lineHeight: 1.85,
            color: TEXT_BODY,
          }}
        >
          {PARAGRAPHS.map((para, idx) => (
            <p
              key={para.key}
              style={{
                marginBottom: idx < PARAGRAPHS.length - 1 ? "1.6em" : 0,
              }}
            >
              {para.content}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}