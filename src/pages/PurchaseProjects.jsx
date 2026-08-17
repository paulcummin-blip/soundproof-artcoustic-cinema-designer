// PurchaseProjects — always-available entry point for buying additional
// Professional Project capacity.
//
// P3: When an effective UNLIMITED_PRO_PROJECTS promotion applies, the
// purchase pack cards are hidden and a restrained message is shown
// instead. No payment is taken. The dealer's banked balance remains
// visible and is unaffected by the promotion.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEffectivePromotion, formatPromotionEndDate } from "@/lib/commercial/useEffectivePromotion";
import { useAuth } from "@/lib/AuthContext";
import { useProfessionalCapacity } from "@/lib/commercial/useProfessionalCapacity";

const PACKS = [
  { count: 5, price: "£50" },
  { count: 20, price: "£180" },
  { count: 100, price: "£750" },
];

export default function PurchaseProjects() {
  const navigate = useNavigate();
  const [selectedPack, setSelectedPack] = useState(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { isEffective: promotionEffective, endsAt: promoEndsAt } = useEffectivePromotion();
  const { available: bankedCapacity, loading: capacityLoading } = useProfessionalCapacity(user?.account_id, isAdmin);

  const showPromotionMessage = !isAdmin && promotionEffective;

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "rgb(248 248 247)",
        color: "#1B1A1A",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8, color: "#1B1A1A" }}>
        Professional Projects
      </h1>
      <p style={{ color: "#3E4349", marginBottom: 28, fontSize: 14, maxWidth: 640 }}>
        Professional Projects permanently unlock the full Sound Proof professional feature set for that cinema project and do not expire.
      </p>

      {/* P3: Promotion-active restrained message — no purchase taken */}
      {showPromotionMessage && (
        <div
          style={{
            padding: 20,
            background: "#FFFFFF",
            border: "1px solid #213428",
            borderLeft: "3px solid #213428",
            borderRadius: 12,
            marginBottom: 24,
            maxWidth: 640,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "#213428", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            Promotion Live
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1B1A1A", marginBottom: 8 }}>
            Unlimited Professional Project access
          </div>
          <div style={{ fontSize: 14, color: "#3E4349", lineHeight: 1.5 }}>
            You currently have unlimited Professional Project access
            {promoEndsAt ? ` until ${formatPromotionEndDate(promoEndsAt)}` : ''}.
          </div>
          <div style={{ fontSize: 14, color: "#3E4349", lineHeight: 1.5, marginTop: 8 }}>
            Your banked Professional Projects ({capacityLoading ? '…' : bankedCapacity}) will remain available after the promotion ends.
          </div>
        </div>
      )}

      {/* Pack cards — hidden while unlimited promotion is active */}
      {!showPromotionMessage && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {PACKS.map((pack) => (
            <div
              key={pack.count}
              style={{
                background: "#FFFFFF",
                border: "1px solid #DCDBD6",
                borderRadius: 12,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1B1A1A" }}>
                {pack.count} Professional Projects
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1B1A1A" }}>
                {pack.price}
              </div>
              <button
                type="button"
                onClick={() => setSelectedPack(pack.count)}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "1px solid #DCDBD6",
                  background: "#F3F2EE",
                  color: "#6E6A62",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Purchase
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedPack && !showPromotionMessage && (
        <div
          style={{
            padding: 16,
            background: "#FFFFFF",
            border: "1px solid #DCDBD6",
            borderRadius: 10,
            fontSize: 14,
            color: "#3E4349",
            marginBottom: 20,
            maxWidth: 640,
          }}
        >
          Online purchasing is being prepared.
          <br />
          Please contact Sound Proof if you need additional Professional Projects during the pilot.
        </div>
      )}

      <div
        style={{
          padding: 16,
          background: "#FFFFFF",
          border: "1px solid #DCDBD6",
          borderRadius: 10,
          fontSize: 13,
          color: "#3E4349",
          marginBottom: 24,
          maxWidth: 640,
        }}
      >
        Professional Projects may also be added to eligible Artcoustic dealer accounts through the Sound Proof rewards programme.
      </div>

      <button
        type="button"
        onClick={() => navigate("/Projects")}
        style={{
          padding: "12px 20px",
          borderRadius: 10,
          border: "1px solid #DCDBD6",
          background: "#1B1A1A",
          color: "#FFFFFF",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        Back to Projects
      </button>
    </div>
  );
}