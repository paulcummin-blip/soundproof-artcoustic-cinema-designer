import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { hasCapability, isMasterAdmin } from "@/lib/accountAccess";
import AccessDeniedScreen from "@/components/AccessDeniedScreen";

// When both props are passed, access is granted if EITHER condition holds,
// so a route can admit master admins AND users holding a scoped capability
// (e.g. /admin/richer-sounds admits Paul or a verified 93 member).
export default function AccessGate({ capability, masterAdmin = false, children }) {
  const { user } = useAuth();
  const allowed =
    (masterAdmin && isMasterAdmin(user)) ||
    (capability ? hasCapability(user, capability) : false);
  return allowed ? children : <AccessDeniedScreen />;
}