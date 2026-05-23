import { Router } from 'express';
import type { Request, Response } from 'express';
import { sessions, broadcastSSE } from '../index.js';
import { enqueue } from '../queue.js';
import { runOptimizations } from '../agent/orchestrator.js';
import { saveReport } from '../db/supabase.js';

const router = Router();

router.post('/apply/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fixIds } = req.body;

  if (!fixIds || !Array.isArray(fixIds) || fixIds.length === 0) {
    res.status(400).json({ error: 'Missing or invalid "fixIds" array' });
    return;
  }

  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (!session.suggestions || session.suggestions.length === 0) {
    res.status(400).json({ error: 'No suggestions available for this session' });
    return;
  }

  if (!session.baseline) {
    res.status(400).json({ error: 'No baseline data available' });
    return;
  }

  // Return immediately
  res.status(202).json({ status: 'applying' });

  // Enqueue optimization run
  enqueue(async () => {
    const emit = (event: Parameters<typeof broadcastSSE>[1]) => {
      broadcastSSE(id, event);
    };

    try {
      session.status = 'applying';
      emit({ type: 'status', data: 'Applying selected optimizations...' });

      const optimizations = await runOptimizations(
        id,
        session.url,
        fixIds,
        session.suggestions!,
        session.baseline!,
        emit
      );

      session.optimizations = optimizations;

      // Calculate total improvement against each result's in-session control
      // (opt.before), not the possibly-stale saved baseline — otherwise the
      // persisted summary reintroduces the network drift we just removed.
      let totalLcpPct = 0;
      for (const opt of optimizations) {
        const beforeLcp = opt.before.lcp;
        if (beforeLcp != null && beforeLcp > 0 && opt.after.lcp != null) {
          totalLcpPct += ((beforeLcp - opt.after.lcp) / beforeLcp) * 100;
        }
      }
      session.totalImprovement = totalLcpPct > 0
        ? `Estimated LCP improvement: -${totalLcpPct.toFixed(1)}% (combined, vs in-session control)`
        : 'No measurable improvement (within run-to-run noise)';

      session.status = 'complete';

      // Persist to Supabase
      try {
        await saveReport(session);
      } catch (err) {
        console.warn('[Apply] Failed to save report to Supabase:', err);
      }

      emit({
        type: 'complete',
        data: {
          optimizations,
          totalImprovement: session.totalImprovement,
          metrics: session.baseline,
          reportUrl: `/report/${id}/html`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      session.status = 'error';
      session.error = message;
      emit({ type: 'error', data: message });
      console.error('[Apply] Error:', message);
    }
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    session.status = 'error';
    session.error = message;
    broadcastSSE(id, { type: 'error', data: message });
    console.error('[Apply] Queue error:', message);
  });
});

export default router;
