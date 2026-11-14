import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * setProjectCommercialOutcome
 * ---------------------------
 * Admin-only endpoint that sets the independent UK-only commercial outcome
 * (Live / Won / Lost) on a Project. This is the ONLY write path for the
 * commercial_outcome field — it enforces:
 *   · Only administrators may change the outcome (403 otherwise)
 *   · Only UK projects are eligible for outcome tracking
 *   · The outcome is entirely independent of the dealer's project_status
 *   · No other field is touched — no engineering, proposals, or history change
 *
 * Payload: { project_id: string, outcome: 'won' | 'lost' | null }
 * Returns: { success: true, project_id, commercial_outcome }
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) =>
      e.status === 401 ? null : Promise.reject(e)
    );
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — commercial outcomes may only be changed by administrators' }, { status: 403 });
    }

    const { project_id, outcome } = await req.json().catch(() => ({}));
    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Validate outcome: must be 'won', 'lost', or null (Live).
    if (outcome !== null && outcome !== 'won' && outcome !== 'lost') {
      return Response.json({ error: "outcome must be 'won', 'lost', or null" }, { status: 400 });
    }

    // Fetch the project to verify it exists and is UK-eligible.
    const project = await base44.entities.Project.get(project_id).catch((e) =>
      e.status === 404 ? null : Promise.reject(e)
    );
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify the project's account is UK. Non-UK projects are not tracked.
    if (project.account_id) {
      const account = await base44.entities.Account.get(project.account_id).catch((e) =>
        e.status === 404 ? null : Promise.reject(e)
      );
      if (account) {
        const territory = String(account.territory || '').toUpperCase().trim();
        const isUk = territory === 'UK' || territory === 'GB';
        if (!isUk) {
          return Response.json({ error: 'Commercial outcomes are only tracked for UK projects' }, { status: 400 });
        }
      }
    } else {
      // No account — admin-created internal project. Not UK-tracked.
      return Response.json({ error: 'Project has no account — commercial outcomes require a UK account' }, { status: 400 });
    }

    // Update only the commercial_outcome field. Nothing else is touched.
    await base44.entities.Project.update(project_id, {
      commercial_outcome: outcome,
    });

    return Response.json({
      success: true,
      project_id,
      commercial_outcome: outcome,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}