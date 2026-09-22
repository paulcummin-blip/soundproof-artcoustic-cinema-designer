import React from "react";

/**
 * Full-screen administrator error shown when the stored Dealer Account ID
 * does not match the authenticated Partner Portal dealer identity.
 *
 * This is a fail-closed security state: the user cannot access the app until
 * an administrator resolves the mismatch. The app does not silently relink.
 */
export default function DealerIdentityMismatchScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F4F0] p-6">
      <div className="max-w-lg text-center space-y-4 font-body">
        <h1 className="text-2xl font-bold text-[#1B1A1A] font-header">
          Dealer Account Mismatch
        </h1>
        <p className="text-sm text-[#3E4349] leading-relaxed">
          Your Sound Proof account is linked to a different Dealer Account than
          the one your Partner Portal login resolved to. For security, Sound
          Proof cannot automatically relink your account.
        </p>
        <p className="text-sm text-[#3E4349] leading-relaxed">
          Please contact Sound Proof support to resolve this before continuing.
        </p>
      </div>
    </div>
  );
}