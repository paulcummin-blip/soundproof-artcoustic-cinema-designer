import React from "react";
import { useAuth } from "@/lib/AuthContext";
import DealerBrandingPanel from "@/components/account/DealerBrandingPanel";

export default function DealerBranding() {
  const { user } = useAuth();
  const accountId = user?.account_id || user?.access_context?.account?.id || null;
  const accountName = user?.access_context?.account?.name || "your account";

  return (
    <div className="min-h-screen bg-[rgb(248,248,247)] p-6 text-[#1B1A1A]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="m-0 text-2xl font-bold">Dealer Branding</h1>
          <p className="mt-1 text-sm text-[#3E4349]">
            Personalise the hero banner shown to your clients. Sound Proof remains the primary brand — your branding appears as a secondary "in partnership with" element.
          </p>
        </div>
        <DealerBrandingPanel accountId={accountId} />
      </div>
    </div>
  );
}