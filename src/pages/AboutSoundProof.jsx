import React from "react";
import { usePublicationContent } from "@/components/publicationContent/usePublicationContent";
import PublicationContentHtml from "@/components/publicationContent/PublicationContentHtml";

const BRAND_GREEN = "#213428";
const TEXT_DARK = "#1B1A1A";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";

export default function AboutSoundProof() {
  const { html, loading } = usePublicationContent("about_sound_proof");

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
            style={{ maxWidth: 280, width: "60%", objectFit: "contain" }}
          />
        </div>

        {/* Thin brand-colour line */}
        <div
          className="mx-auto mb-10"
          style={{ width: "40%", maxWidth: 200, height: 2, background: BRAND_GREEN }}
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

        {/* Body copy — canonical published content */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#625143", padding: 40 }}>Loading…</div>
        ) : (
          <PublicationContentHtml
            html={html}
            variant="screen"
            style={{ maxWidth: 560, margin: "0 auto" }}
          />
        )}
      </div>
    </div>
  );
}