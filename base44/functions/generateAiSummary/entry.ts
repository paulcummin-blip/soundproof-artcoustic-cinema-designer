import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { buildSingleSummaryPrompt, buildComparisonSummaryPrompt } from '../../shared/aiSummaryPromptBuilder.js';

/**
 * generateAiSummary — server-side AI Client Summary generation.
 *
 * Receives the canonical payload (built client-side from the settled Design
 * Rating authority) and calls InvokeLLM to generate a client-facing summary.
 *
 * The AI layer is a CONSUMER, not an authority. This function never
 * recalculates engineering values — it only interprets the payload.
 *
 * Model configuration is server-side only. Defaults to 'automatic' (cheapest
 * suitable model). Admin can override via secrets:
 *   AI_SUMMARY_SINGLE_MODEL, AI_SUMMARY_COMPARISON_MODEL
 *
 * No API keys are exposed client-side. The frontend calls this function via
 * base44.functions.invoke('generateAiSummary', { ... }).
 *
 * Input:
 *   { summaryType: 'single' | 'comparison',
 *     payload: <single payload>,
 *     comparisonPayloads: [<payload>, ...],  // for comparison
 *     versionLabels: ['V1', 'V2', ...]        // for comparison
 *   }
 *
 * Output:
 *   { summaryText: string, model: string, timestamp: string }
 */

// Central model configuration. Defaults to 'automatic' (cheapest suitable
// model). Admin can change the model here without modifying report code.
function resolveModel(summaryType) {
  return 'automatic';
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { summaryType, payload, comparisonPayloads, versionLabels } = body;

    if (!summaryType || (summaryType !== 'single' && summaryType !== 'comparison')) {
      return Response.json({ error: 'Invalid summaryType' }, { status: 400 });
    }

    // ── Validate payload(s) ──
    if (summaryType === 'single') {
      if (!payload || !payload.identity) {
        return Response.json({ error: 'Missing payload for single summary' }, { status: 400 });
      }
    } else {
      if (!Array.isArray(comparisonPayloads) || comparisonPayloads.length < 2) {
        return Response.json({ error: 'Comparison requires at least 2 payloads' }, { status: 400 });
      }
      // All versions must belong to the same project
      const projectIds = comparisonPayloads.map((p) => p?.identity?.projectId).filter(Boolean);
      const uniqueProjects = new Set(projectIds);
      if (uniqueProjects.size > 1) {
        return Response.json({ error: 'All comparison versions must belong to the same project' }, { status: 400 });
      }
    }

    // ── Build prompt ──
    const model = resolveModel(summaryType);
    let prompt;
    if (summaryType === 'single') {
      prompt = buildSingleSummaryPrompt(payload);
    } else {
      prompt = buildComparisonSummaryPrompt({ payloads: comparisonPayloads, versionLabels });
    }

    // ── Call InvokeLLM ──
    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt,
      model,
    });

    const summaryText = typeof llmResponse === 'string'
      ? llmResponse
      : (llmResponse?.text || llmResponse?.content || String(llmResponse || ''));

    return Response.json({
      summaryText,
      model,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}