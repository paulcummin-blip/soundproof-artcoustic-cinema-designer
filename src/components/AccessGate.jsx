import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { hasCapability, isMasterAdmin } from "@/lib/accountAccess";
import AccessDeniedScreen from "@/components/AccessDeniedScreen";

export default function AccessGate({ capability, masterAdmin = false, children }) {
  const { user } = useAuth();
  const allowed = masterAdmin ? isMasterAdmin(user) : hasCapability(user, capability);
  return allowed ? children : <AccessDeniedScreen />;
}
