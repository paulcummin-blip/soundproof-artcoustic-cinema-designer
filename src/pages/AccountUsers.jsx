import React from "react";
import { useAuth } from "@/lib/AuthContext";
import AccountUsersPanel from "@/components/account/AccountUsersPanel";

export default function AccountUsers() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[rgb(248,248,247)] p-6 text-[#1B1A1A]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="m-0 text-2xl font-bold">Users &amp; Permissions</h1>
          <p className="mt-1 text-sm text-[#3E4349]">
            Manage the five logins available to {user?.access_context?.account?.name || "your account"}.
          </p>
        </div>
        <AccountUsersPanel />
      </div>
    </div>
  );
}
