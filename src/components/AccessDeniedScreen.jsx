import React from "react";
import { ShieldX } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { defaultPathForUser } from "@/lib/accountAccess";

export default function AccessDeniedScreen({
  title = "Access not included",
  message = "This login does not have permission to open this area.",
  reason = null,
  identity = null,
}) {
  const { user, logout } = useAuth();
  const signedInAs = identity || user?.email || null;
  const destination = defaultPathForUser(user);
  const destinationLabel = destination === "/PriceList"
    ? "Go to Price List"
    : destination === "/admin"
      ? "Go to Admin"
      : "Go to Projects";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-8 bg-[rgb(248,248,247)]">
      <div className="w-full max-w-lg rounded-xl border border-[#DCDBD6] bg-white p-8 text-center shadow-sm">
        <ShieldX className="mx-auto mb-4 h-9 w-9 text-[#625143]" />
        <h1 className="m-0 text-xl font-bold text-[#1B1A1A]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#3E4349]">{message}</p>
        {(reason || identity) && (
          <div className="mt-5 rounded-lg border border-[#DCDBD6] bg-[rgb(248,248,247)] p-3 text-left">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">
              Access check
            </div>
            {signedInAs && (
              <p className="mt-1 text-xs text-[#3E4349]">
                Signed in as: <span className="font-semibold">{signedInAs}</span>
              </p>
            )}
            {reason && (
              <p className="mt-1 text-xs text-[#3E4349]">
                Reason: <span className="font-mono">{reason}</span>
              </p>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3">
          {destination !== "/" && (
            <a
              href={destination}
              className="inline-flex justify-center rounded-lg bg-[#213428] px-5 py-2.5 text-sm font-semibold text-white no-underline"
            >
              {destinationLabel}
            </a>
          )}
          <button
            type="button"
            onClick={() => logout(true)}
            className="inline-flex justify-center rounded-lg border border-[#DCDBD6] bg-white px-5 py-2.5 text-sm font-semibold text-[#213428] transition-colors hover:bg-[rgb(248,248,247)]"
          >
            Sign out / switch account
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#625143]">
          This signs out the session shown above and returns you to the login screen so a different
          identity can sign in. No project data is changed.
        </p>
      </div>
    </div>
  );
}