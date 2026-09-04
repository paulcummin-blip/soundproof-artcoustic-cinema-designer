import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isMasterAdmin } from "@/lib/accountAccess";

/**
 * Redirects non-admin users away from admin-only pages.
 * Uses the existing central admin-role authority (isMasterAdmin).
 */
export default function AdminOnlyRoute({ children, redirectTo = "/Projects" }) {
  const { user } = useAuth();
  if (!isMasterAdmin(user)) {
    return <Navigate replace to={redirectTo} />;
  }
  return children;
}