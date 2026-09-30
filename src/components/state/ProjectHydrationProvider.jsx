// ProjectHydrationProvider.jsx
// --------------------------------
// The single project context for the app.
//
// It watches the active project id and loads that project's IDENTITY (name,
// client, active version) into the canonical hydration store, so the sidebar,
// Project Images and every global page describe the same project.
//
// It does NOT load design state: the Room Designer loader and the report
// authority hydrate the saved design state and report it into the same store
// via beginDesignHydration / completeDesignHydration / failDesignHydration.

import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useActiveProjectId } from "@/components/state/project-session";
import {
  beginProjectHydration,
  setProjectIdentity,
  failProjectHydration,
  markIdentityMissing,
  resetProjectHydration,
} from "@/components/state/projectHydrationStore";

export default function ProjectHydrationProvider({ children }) {
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    if (!activeProjectId) {
      resetProjectHydration();
      return undefined;
    }

    let cancelled = false;
    beginProjectHydration(activeProjectId);

    (async () => {
      try {
        const results = await base44.entities.Project.filter({ id: activeProjectId });
        if (cancelled) return;
        const project = Array.isArray(results) && results.length > 0 ? results[0] : null;
        if (!project) {
          markIdentityMissing(activeProjectId);
          return;
        }
        setProjectIdentity(activeProjectId, {
          name: project.name || null,
          clientName: project.client_name || null,
          projectReference: project.project_reference || null,
          // Dealer identity: the name stamped on the project at creation, and —
          // only when that is absent — the owning account, so a real dealer
          // account can still supply its name.
          dealerName: project.dealer_name || null,
          accountId: project.account_id || null,
          activeVersionId: project.active_version_id || null,
        });

        if (!project.dealer_name && project.account_id) {
          try {
            const accounts = await base44.entities.Account.filter({ id: project.account_id });
            if (cancelled) return;
            const account = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
            if (account) {
              setProjectIdentity(activeProjectId, {
                accountName: account.name || null,
                accountType: account.account_type || null,
              });
            }
          } catch (accountError) {
            // The owning account is optional identity context: an account read
            // this user is not permitted to make must never fail the project
            // identity load. The stamped dealer name is still shown.
            console.warn("[ProjectHydrationProvider] Account identity unavailable:", accountError?.message);
          }
        }
      } catch (error) {
        if (cancelled) return;
        failProjectHydration(
          activeProjectId,
          error?.message || "Project could not be loaded"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  return children;
}