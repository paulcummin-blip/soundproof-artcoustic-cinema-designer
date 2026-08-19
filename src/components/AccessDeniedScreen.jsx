import React from "react";
import { ShieldX } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { defaultPathForUser } from "@/lib/accountAccess";

export default function AccessDeniedScreen({
  title = "Access not included",
  message = "This login does not have permission to open this area.",
}) {
  const { user } = useAuth();
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
        {destination !== "/" && (
          <a
            href={destination}
            className="mt-5 inline-flex rounded-lg bg-[#213428] px-5 py-2.5 text-sm font-semibold text-white no-underline"
          >
            {destinationLabel}
          </a>
        )}
      </div>
    </div>
  );
}
